import { BufferJSON, proto } from 'baileys';
import { store } from './storage.js';

// Store sent messages so they can be replayed when the recipient requests a retry.
// Without this, the recipient can get stuck on "waiting for this message".

// Retries are only relevant shortly after sending, so drop entries older than 7 days.
store.deleteExpiredSentMessages(Date.now() - 7 * 24 * 3600 * 1000);

export function storeSentMessage(sessionId: string, msgId: string, message: proto.IMessage): void {
    store.setSentMessage(sessionId, msgId, JSON.stringify(message, BufferJSON.replacer), Date.now());
}

export function getSentMessage(sessionId: string, msgId: string): proto.IMessage | undefined {
    const message = store.getSentMessage(sessionId, msgId);
    return message ? JSON.parse(message, BufferJSON.reviver) : undefined;
}
