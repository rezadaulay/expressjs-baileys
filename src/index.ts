import 'dotenv/config';
import { createApp } from './app.js';
import { getTenancyConfig } from './config.js';
import { restoreSessions } from './whatsapp.js';

const PORT = process.env.PORT || 5000;
const tenancy = getTenancyConfig();

createApp().listen(PORT, () => {
    console.log(`WhatsApp server berjalan di http://localhost:${PORT}`);
    restoreSessions(tenancy);
});
