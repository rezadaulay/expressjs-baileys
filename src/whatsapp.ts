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
import { useSQLiteAuthState } from './auth-store.js';
import { TenancyConfig } from './config.js';
import { listSessionIds } from './db.js';
import { getSentMessage, storeSentMessage } from './message-store.js';
import { MediaAttachment } from './utils.js';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const logger = pino({ level: 'debug' });

// cache hitungan retry pesan — harus hidup DI LUAR socket agar tidak ter-reset
// saat reconnect (mencegah loop enkripsi/dekripsi; lihat Example/example.ts Baileys)
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
    // per session, bukan per socket — bertahan melewati reconnect
    private msgRetryCounterCache = new MsgRetryCache();

    constructor(readonly id: string) {}

    async connect(): Promise<void> {
        const { state, saveCreds, removeAll } = useSQLiteAuthState(this.id);
        // env WA_WEB_VERSION=2.3000.xxxxx = pengaman saat server WA menolak versi
        // tertentu (pernah terjadi Feb 2026, Baileys issue #2370) tanpa perlu deploy
        const version = process.env.WA_WEB_VERSION
            ? (process.env.WA_WEB_VERSION.split('.').map(Number) as [number, number, number])
            : (await fetchLatestBaileysVersion()).version;

        this.status = 'connecting';
        this.sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                // cache di atas store SQLite — mengurangi masalah sesi signal basi
                keys: makeCacheableSignalKeyStore(state.keys, logger)
            },
            // sejak ~2026-06-30 server WA menolak registrasi identitas Desktop
            // (WIN32/DARWIN) dengan 428 sebelum QR — wajib WEB_BROWSER
            // (Baileys issue #2677)
            browser: Browsers.ubuntu('Chrome'),
            logger,
            msgRetryCounterCache: this.msgRetryCounterCache,
            // dipanggil Baileys saat penerima meminta pesan dikirim ulang (retry) —
            // tanpa ini pesan bisa stuck "waiting for this message" di penerima
            getMessage: async (key) => (key.id ? getSentMessage(this.id, key.id) : undefined)
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                this.currentQR = qr;
                this.status = 'disconnected';
                console.log(`[${this.id}] QR code baru tersedia — buka /${this.id}/qr untuk scan`);
            }

            if (connection === 'open') {
                this.status = 'connected';
                this.currentQR = null;
                console.log(`[${this.id}] WhatsApp terhubung sebagai ${this.sock?.user?.id}`);
            }

            if (connection === 'close') {
                const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
                const loggedOut = statusCode === DisconnectReason.loggedOut;
                this.status = 'disconnected';
                console.log(`[${this.id}] Koneksi terputus (code ${statusCode}), logged out: ${loggedOut}`);

                if (loggedOut) {
                    // sesi tidak valid lagi — hapus kredensial agar QR baru muncul
                    removeAll();
                }
                if (!this.stopped) {
                    // 515 = restart wajib pasca-pairing, langsung sambung; selain itu
                    // beri jeda agar tidak hammering saat server WA menolak berulang
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

    // kirim + simpan hasilnya agar bisa dilayani ulang lewat getMessage saat retry
    private async sendAndStore(jid: string, content: AnyMessageContent): Promise<void> {
        const sent = await this.sock!.sendMessage(jid, content);
        if (sent?.key?.id && sent.message) {
            storeSentMessage(this.id, sent.key.id, sent.message);
        }
    }

    async sendTextMessage(phone: string, message: string): Promise<void> {
        const { exists, jid } = await this.checkNumber(phone);
        if (!exists || !jid) {
            throw new Error('number not registered on WhatsApp');
        }

        await this.sendAndStore(jid, { text: message });
    }

    async sendMediaMessage(phone: string, media: MediaAttachment, caption = ''): Promise<void> {
        const { exists, jid } = await this.checkNumber(phone);
        if (!exists || !jid) {
            throw new Error('number not registered on WhatsApp');
        }

        const url = { url: media.url };
        switch (media.kind) {
            case 'image':
                await this.sendAndStore(jid, { image: url, caption });
                break;
            case 'video':
                await this.sendAndStore(jid, { video: url, caption });
                break;
            case 'audio':
                // audio tidak mendukung caption di WhatsApp
                await this.sendAndStore(jid, { audio: url, mimetype: media.mimetype });
                break;
            default:
                await this.sendAndStore(jid, {
                    document: url,
                    mimetype: media.mimetype,
                    fileName: media.filename,
                    caption
                });
        }
    }

    // putus-sambung websocket tanpa menghapus kredensial (untuk koneksi stuck)
    restartSocket(): void {
        this.sock?.end(new Error('restart'));
    }

    // reset total: buang kredensial lalu mulai sesi baru (QR baru).
    // beda dengan logout(): tidak lapor ke server WA — untuk sesi rusak/stuck
    async restart(): Promise<void> {
        this.stopped = true;
        try {
            this.sock?.end(new Error('restart'));
        } catch {
            // socket mungkin sudah mati
        }
        this.sock = null;
        this.status = 'disconnected';
        this.currentQR = null;
        useSQLiteAuthState(this.id).removeAll();
        this.stopped = false;
        await this.connect();
    }

    async logout(): Promise<void> {
        this.stopped = true;
        try {
            await this.sock?.logout();
        } catch {
            // socket mungkin sudah mati — creds tetap harus dihapus
        }
        this.sock = null;
        this.status = 'disconnected';
        this.currentQR = null;
        useSQLiteAuthState(this.id).removeAll();
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

// saat single-tenant, hanya pulihkan/buat sesi default.
// saat multi-tenant, pulihkan semua sesi yang punya kredensial tersimpan.
export function restoreSessions(config: TenancyConfig): void {
    if (config.mode === 'single') {
        console.log(`[${config.defaultSession}] menyiapkan sesi default...`);
        getOrCreateSession(config.defaultSession);
        return;
    }

    for (const id of listSessionIds()) {
        console.log(`[${id}] memulihkan sesi dari database...`);
        getOrCreateSession(id);
    }
}
