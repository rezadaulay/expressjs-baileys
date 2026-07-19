import 'dotenv/config';
import { createApp } from './app.js';
import { getTenancyConfig, getWebhookConfig } from './config.js';
import { restoreSessions } from './whatsapp.js';
import { ensureWebhookEnabledAt } from './webhook/webhook-store.js';
import { startWebhookDispatcher } from './webhook/dispatcher.js';

const PORT = process.env.PORT || 5000;
const tenancy = getTenancyConfig();
const webhook = getWebhookConfig();

createApp().listen(PORT, () => {
    console.log(`WhatsApp server berjalan di http://localhost:${PORT}`);
    restoreSessions(tenancy);
    if (webhook.enabled) {
        ensureWebhookEnabledAt();
        startWebhookDispatcher(webhook);
    }
});
