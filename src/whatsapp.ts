import makeWASocket, {
    AnyMessageContent,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket
} from 'baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { usePersistentAuthState } from './auth-store.js';
import { TenancyConfig } from './config.js';
import { listSessionIds } from './db.js';
import { getSentMessage, storeSentMessage } from './message-store.js';
import { MediaAttachment } from './utils.js';
import { handleMessagesUpsert } from './webhook/webhook-store.js';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const logger = pino({ level: 'debug' });

// Message retry counter cache must live OUTSIDE the socket so reconnects do not reset it
// and trigger encryption/decryption retry loops; see Baileys Example/example.ts.
class MsgRetryCache {
    private map = new Map<string, unknown>();
    get<T>(key: string): T | undefined {
        return this.map.get(key) as T | undefined;
    }
    set<T>(key: string, value: T): void {
        this.map.set(key, value);
    }
    del(key: string): void {
        this.map.delete(key);
    }
    flushAll(): void {
        this.map.clear();
    }
}

export class WhatsAppSession {
    private sock: WASocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private currentQR: string | null = null;
    private stopped = false;
    // Per session, not per socket, so it survives reconnects.
    private msgRetryCounterCache = new MsgRetryCache();

    constructor(readonly id: string) {}

    async connect(): Promise<void> {
        const { state, saveCreds, removeAll } = usePersistentAuthState(this.id);
        // WA_WEB_VERSION=2.3000.xxxxx lets us pin a fallback if WhatsApp rejects
        // a specific web version again (as happened in February 2026, Baileys #2370).
        const version = process.env.WA_WEB_VERSION
            ? (process.env.WA_WEB_VERSION.split('.').map(Number) as [number, number, number])
            : (await fetchLatestBaileysVersion()).version;

        this.status = 'connecting';
        this.sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // Cache on top of the SQLite store to reduce stale Signal session issues.
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            // Since around 2026-06-30 WhatsApp has rejected Desktop identity
            // registration (WIN32/DARWIN) with 428 before QR, so WEB_BROWSER is required
            // (Baileys issue #2677).
            browser: Browsers.ubuntu('Chrome'),
            logger,
            msgRetryCounterCache: this.msgRetryCounterCache,
            // Called by Baileys when the recipient requests a retry. Without this,
            // the recipient can get stuck on "waiting for this message".
            getMessage: async (key) => (key.id ? getSentMessage(this.id, key.id) : undefined)
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.currentQR = qr;
                this.status = 'disconnected';
                console.log(`[${this.id}] A new QR code is available. Open /${this.id}/qr to scan it.`);
            }

            if (connection === 'open') {
                this.status = 'connected';
                this.currentQR = null;
                console.log(`[${this.id}] WhatsApp connected as ${this.sock?.user?.id}`);
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                this.status = 'disconnected';
                console.log(`[${this.id}] Connection closed (code ${statusCode}), logged out: ${loggedOut}`);

                if (loggedOut) {
                    // The session is no longer valid, so clear credentials and require a new QR.
                    removeAll();
                }
                if (!this.stopped) {
                    // 515 means an immediate post-pairing restart is required. For anything
                    // else, wait a bit so we do not hammer the server on repeated failures.
                    if (statusCode === DisconnectReason.restartRequired) {
                        this.connect();
                    } else {
                        setTimeout(() => {
                            if (!this.stopped) this.connect();
                        }, 5000);
                    }
                }
            }
        });
        this.sock.ev.on('messages.upsert', (upsert) => {
            if (upsert.type !== 'notify' && upsert.type !== 'append') return;
            handleMessagesUpsert(this.id, this.sock?.user?.id, upsert);
        });
    }

    getStatus(): { session: string; status: ConnectionStatus; user?: { id: string; name?: string } } {
        if (this.status === 'connected' && this.sock?.user) {
            return {
                session: this.id,
                status: this.status,
                user: { id: this.sock.user.id, name: this.sock.user.name }
            };
        }
        return { session: this.id, status: this.status };
    }

    getQR(): string | null {
        return this.currentQR;
    }

    async checkNumber(phone: string): Promise<{ exists: boolean; jid?: string }> {
        if (this.status !== 'connected' || !this.sock) {
            throw new Error('not connected');
        }

        const results = await this.sock.onWhatsApp(`${phone}@s.whatsapp.net`);
        const result = results?.[0];
        if (result?.exists) {
            return { exists: true, jid: result.jid };
        }
        return { exists: false };
    }

    // Send and persist the message so getMessage can replay it during retries.
    private async sendAndStore(jid: string, content: AnyMessageContent): Promise<string | null> {
        const sent = await this.sock!.sendMessage(jid, content);
        if (sent?.key?.id && sent.message) {
            storeSentMessage(this.id, sent.key.id, sent.message);
        }
        return sent?.key?.id ?? null;
    }

    async sendTextMessage(phone: string, message: string): Promise<{ messageId: string | null }> {
        const { exists, jid } = await this.checkNumber(phone);
        if (!exists || !jid) {
            throw new Error('number not registered on WhatsApp');
        }

        return { messageId: await this.sendAndStore(jid, { text: message }) };
    }

    async sendMediaMessage(phone: string, media: MediaAttachment, caption = ''): Promise<{ messageId: string | null }> {
        const { exists, jid } = await this.checkNumber(phone);
        if (!exists || !jid) {
            throw new Error('number not registered on WhatsApp');
        }

        const url = { url: media.url };
        switch (media.kind) {
            case 'image':
                return { messageId: await this.sendAndStore(jid, { image: url, caption }) };
            case 'video':
                return { messageId: await this.sendAndStore(jid, { video: url, caption }) };
            case 'audio':
                // Audio does not support captions in WhatsApp.
                return { messageId: await this.sendAndStore(jid, { audio: url, mimetype: media.mimetype }) };
            default:
                return { messageId: await this.sendAndStore(jid, {
                    document: url,
                    mimetype: media.mimetype,
                    fileName: media.filename,
                    caption
                }) };
        }
    }

    // Reconnect the websocket without clearing credentials, useful for stuck connections.
    restartSocket(): void {
        this.sock?.end(new Error('restart'));
    }

    // Full reset: clear credentials and start a fresh session with a new QR.
    // Unlike logout(), this does not notify WhatsApp and is meant for broken/stuck sessions.
    async restart(): Promise<void> {
        this.stopped = true;
        try {
            this.sock?.end(new Error('restart'));
        } catch {
            // The socket may already be closed.
        }
        this.sock = null;
        this.status = 'disconnected';
        this.currentQR = null;
        usePersistentAuthState(this.id).removeAll();
        this.stopped = false;
        await this.connect();
    }

    async logout(): Promise<void> {
        this.stopped = true;
        try {
            await this.sock?.logout();
        } catch {
            // The socket may already be closed, but credentials still need to be removed.
        }
        this.sock = null;
        this.status = 'disconnected';
        this.currentQR = null;
        usePersistentAuthState(this.id).removeAll();
    }
}

const sessions = new Map<string, WhatsAppSession>();

export function getOrCreateSession(id: string): WhatsAppSession {
    let session = sessions.get(id);
    if (!session) {
        session = new WhatsAppSession(id);
        sessions.set(id, session);
        session.connect();
    }
    return session;
}

export function getSessions(): WhatsAppSession[] {
    return [...sessions.values()];
}

export function removeSession(id: string): void {
    sessions.delete(id);
}

// In single-tenant mode, only restore or create the default session.
// In multi-tenant mode, restore every session that still has stored credentials.
export function restoreSessions(config: TenancyConfig): void {
    if (config.mode === 'single') {
        console.log(`[${config.defaultSession}] Preparing the default session...`);
        getOrCreateSession(config.defaultSession);
        return;
    }

    for (const id of listSessionIds()) {
        console.log(`[${id}] Restoring session from the database...`);
        getOrCreateSession(id);
    }
}
