import { createApp } from './app';
import { restoreSessions } from './whatsapp';

const PORT = process.env.PORT || 3000;

createApp().listen(PORT, () => {
    console.log(`WhatsApp server berjalan di http://localhost:${PORT}`);
    restoreSessions();
});
