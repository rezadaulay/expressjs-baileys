import express, { Express } from 'express';
import QRCode from 'qrcode';
import { getOrCreateSession, getSessions, removeSession, WhatsAppSession } from './whatsapp';
import { normalizePhone } from './utils';

export const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,32}$/;

export function createApp(): Express {
    const app = express();
    app.use(express.json());

    app.get('/sessions', (_req, res) => {
        res.json(getSessions().map((s) => s.getStatus()));
    });

    const router = express.Router({ mergeParams: true });

    router.use((req, res, next) => {
        const id = (req.params as { session: string }).session;
        if (!SESSION_NAME_RE.test(id)) {
            return res.status(400).json({ error: 'nama session tidak valid (huruf/angka/-/_, maks 32 karakter)' });
        }
        res.locals.wa = getOrCreateSession(id);
        next();
    });

    router.get('/status', (_req, res) => {
        const wa = res.locals.wa as WhatsAppSession;
        res.json(wa.getStatus());
    });

    router.get('/qr', async (_req, res) => {
        const wa = res.locals.wa as WhatsAppSession;
        if (wa.getStatus().status === 'connected') {
            return res.json({ message: 'already connected' });
        }

        const qr = wa.getQR();
        if (!qr) {
            return res.status(404).json({ message: 'QR belum tersedia, coba lagi beberapa detik' });
        }

        const dataUrl = await QRCode.toDataURL(qr);
        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <html>
                <head><meta http-equiv="refresh" content="20"></head>
                <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif">
                    <h1>Scan dengan WhatsApp — sesi "${wa.id}"</h1>
                    <img src="${dataUrl}" width="300" height="300" />
                    <p>WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat</p>
                </body>
            </html>
        `);
    });

    router.get('/check-number', async (req, res) => {
        const wa = res.locals.wa as WhatsAppSession;
        const normalized = normalizePhone(req.query.phone);
        if (!normalized) {
            return res.status(400).json({ error: 'query param phone wajib diisi dengan nomor valid' });
        }

        try {
            const result = await wa.checkNumber(normalized);
            res.json({ phone: normalized, exists: result.exists });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'failed';
            if (msg === 'not connected') {
                return res.status(400).json({ error: `WhatsApp belum terhubung, scan QR dulu di /${wa.id}/qr` });
            }
            console.error(`[${wa.id}] check-number error:`, e);
            res.status(500).json({ error: 'gagal mengecek nomor' });
        }
    });

    router.post('/send-message', async (req, res) => {
        const wa = res.locals.wa as WhatsAppSession;
        const { phone, message } = req.body ?? {};

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'phone dan message wajib diisi' });
        }

        const normalized = normalizePhone(phone);
        if (!normalized) {
            return res.status(400).json({ error: 'nomor telepon tidak valid' });
        }

        try {
            await wa.sendTextMessage(normalized, message);
            res.json({ success: true });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'failed';
            if (msg === 'not connected') {
                return res.status(400).json({ error: `WhatsApp belum terhubung, scan QR dulu di /${wa.id}/qr` });
            }
            if (msg === 'number not registered on WhatsApp') {
                return res.status(400).json({ error: 'nomor tidak terdaftar di WhatsApp' });
            }
            console.error(`[${wa.id}] send-message error:`, e);
            res.status(500).json({ error: 'gagal mengirim pesan' });
        }
    });

    router.post('/logout', async (_req, res) => {
        const wa = res.locals.wa as WhatsAppSession;
        await wa.logout();
        removeSession(wa.id);
        res.json({ success: true, message: `sesi "${wa.id}" dihapus` });
    });

    app.use('/:session', router);

    return app;
}
