import makeWASocket, {
    Browsers,
    DisconnectReason,
    fetchLatestWaWebVersion,
    WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import { useSQLiteAuthState } from './auth-store';
import { listSessionIds } from './db';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const logger = pino({ level: 'warn' });

export class WhatsAppSession {
    private sock: WASocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private currentQR: string | null = null;
    private stopped = false;

    constructor(readonly id: string) {}

    async connect(): Promise<void> {
        const { state, saveCreds, removeAll } = useSQLiteAuthState(this.id);
        const { version } = await fetchLatestWaWebVersion({});

        this.status = 'connecting';
        this.sock = makeWASocket({
            version,
            auth: state,
            browser: Browsers.windows('Desktop'),
            printQRInTerminal: false,
            logger
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
                    this.connect();
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

    async sendTextMessage(phone: string, message: string): Promise<void> {
        const { exists, jid } = await this.checkNumber(phone);
        if (!exists || !jid) {
            throw new Error('number not registered on WhatsApp');
        }

        await this.sock!.sendMessage(jid, { text: message });
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

// sambungkan ulang semua tenant yang punya kredensial tersimpan
export function restoreSessions(): void {
    for (const id of listSessionIds()) {
        console.log(`[${id}] memulihkan sesi dari database...`);
        getOrCreateSession(id);
    }
}
