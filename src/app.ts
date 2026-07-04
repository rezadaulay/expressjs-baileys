import express, { Express } from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { getOrCreateSession, getSessions, removeSession, WhatsAppSession } from './whatsapp.js';
import { getTenancyConfig, isValidCountryCode } from './config.js';
import { SESSION_NAME_RE } from './session.js';
import { normalizePhone, parseMediaAttachment } from './utils.js';

export function createApp(): Express {
    const tenancy = getTenancyConfig();
    const app = express();
    app.use(cors());
    app.use(express.json());

    const getQrPath = (wa: WhatsAppSession): string => (tenancy.mode === 'multi' ? `/${wa.id}/qr` : '/qr');
    const resolveCountryCode = (value: unknown): string | null => {
        if (value === undefined) {
            return tenancy.defaultCountryCode;
        }
        if (typeof value !== 'string') {
            return null;
        }
        const normalized = value.trim();
        return isValidCountryCode(normalized) ? normalized : null;
    };

    if (tenancy.mode === 'multi') {
        app.get('/sessions', (_req, res) => {
            res.json(getSessions().map((s) => s.getStatus()));
        });
    } else {
        app.all('/sessions', (_req, res) => {
            res.status(404).json({ error: 'the /sessions endpoint is only available when WA_MODE=multi' });
        });
    }

    const router = express.Router({ mergeParams: true });

    router.use((req, res, next) => {
        const id = tenancy.mode === 'multi' ? (req.params as { session: string }).session : tenancy.defaultSession;
        if (tenancy.mode === 'multi' && !SESSION_NAME_RE.test(id)) {
            return res.status(400).json({ error: 'invalid session name (letters/numbers/-/_, max 32 characters)' });
        }
        res.locals.sessionId = id;
        next();
    });

    const getSession = (res: express.Response): WhatsAppSession => {
        const sessionId = res.locals.sessionId as string;
        return getOrCreateSession(sessionId);
    };

    router.get('/status', (_req, res) => {
        const wa = getSession(res);
        res.json(wa.getStatus());
    });

    router.get('/qr', async (_req, res) => {
        const wa = getSession(res);
        if (wa.getStatus().status === 'connected') {
            return res.json({ message: 'already connected' });
        }

        const qr = wa.getQR();
        if (!qr) {
            return res.status(404).json({ message: 'QR is not available yet, try again in a few seconds' });
        }

        const dataUrl = await QRCode.toDataURL(qr);
        res.setHeader('Content-Type', 'text/html');
        res.send(`
            <html>
                <head><meta http-equiv="refresh" content="20"></head>
                <body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif">
                    <img src="${dataUrl}" width="300" height="300" />
                </body>
            </html>
        `);
    });

    router.get('/check-number', async (req, res) => {
        const countryCode = resolveCountryCode(req.query.countryCode);
        if (!countryCode) {
            return res.status(400).json({ error: 'invalid countryCode query parameter' });
        }

        const normalized = normalizePhone(req.query.phone, countryCode);
        if (!normalized) {
            return res.status(400).json({ error: 'the phone query parameter must be a valid phone number' });
        }

        const wa = getSession(res);
        try {
            const result = await wa.checkNumber(normalized);
            res.json({ phone: normalized, exists: result.exists });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'failed';
            if (msg === 'not connected') {
                return res.status(400).json({ error: `WhatsApp is not connected yet, scan the QR first at ${getQrPath(wa)}` });
            }
            console.error(`[${wa.id}] check-number error:`, e);
            res.status(500).json({ error: 'failed to check the phone number' });
        }
    });

    router.post('/send-message', async (req, res) => {
        const { phone, message, countryCode } = req.body ?? {};

        if (typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({ error: 'phone and message are required' });
        }

        const effectiveCountryCode = resolveCountryCode(countryCode);
        if (!effectiveCountryCode) {
            return res.status(400).json({ error: 'invalid countryCode' });
        }

        const normalized = normalizePhone(phone, effectiveCountryCode);
        if (!normalized) {
            return res.status(400).json({ error: 'invalid phone number' });
        }

        const wa = getSession(res);
        try {
            await wa.sendTextMessage(normalized, message);
            res.json({ success: true });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'failed';
            if (msg === 'not connected') {
                return res.status(400).json({ error: `WhatsApp is not connected yet, scan the QR first at ${getQrPath(wa)}` });
            }
            if (msg === 'number not registered on WhatsApp') {
                return res.status(400).json({ error: 'phone number is not registered on WhatsApp' });
            }
            console.error(`[${wa.id}] send-message error:`, e);
            res.status(500).json({ error: 'failed to send the message' });
        }
    });

    router.post('/send-media', async (req, res) => {
        const { phone, media, filename, caption, countryCode } = req.body ?? {};

        const effectiveCountryCode = resolveCountryCode(countryCode);
        if (!effectiveCountryCode) {
            return res.status(400).json({ error: 'invalid countryCode' });
        }

        const normalized = normalizePhone(phone, effectiveCountryCode);
        if (!normalized) {
            return res.status(400).json({ error: 'invalid phone number' });
        }

        const attachment = parseMediaAttachment(media, filename);
        if (!attachment) {
            return res.status(400).json({ error: 'media must be a valid http/https URL' });
        }

        if (caption !== undefined && typeof caption !== 'string') {
            return res.status(400).json({ error: 'caption must be a string' });
        }

        const wa = getSession(res);
        try {
            await wa.sendMediaMessage(normalized, attachment, caption);
            res.json({ success: true, kind: attachment.kind });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'failed';
            if (msg === 'not connected') {
                return res.status(400).json({ error: `WhatsApp is not connected yet, scan the QR first at ${getQrPath(wa)}` });
            }
            if (msg === 'number not registered on WhatsApp') {
                return res.status(400).json({ error: 'phone number is not registered on WhatsApp' });
            }
            console.error(`[${wa.id}] send-media error:`, e);
            res.status(500).json({ error: 'failed to send the media' });
        }
    });

    router.post('/restart-socket', (_req, res) => {
        const wa = getSession(res);
        wa.restartSocket();
        res.json({ success: true, message: 'the websocket was restarted and will reconnect automatically' });
    });

    router.post('/restart', async (_req, res) => {
        const wa = getSession(res);
        await wa.restart();
        res.json({ success: true, message: `session reset, scan a new QR at ${getQrPath(wa)}` });
    });

    router.post('/logout', async (_req, res) => {
        const wa = getSession(res);
        await wa.logout();
        removeSession(wa.id);
        res.json({ success: true, message: `session "${wa.id}" deleted` });
    });

    app.use(tenancy.mode === 'multi' ? '/:session' : '/', router);

    return app;
}
