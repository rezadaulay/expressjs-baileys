import 'dotenv/config';
import { createApp } from './app.js';
import { restoreSessions } from './whatsapp.js';

const PORT = process.env.PORT || 5000;

createApp().listen(PORT, () => {
    console.log(`WhatsApp server berjalan di http://localhost:${PORT}`);
    restoreSessions();
});
