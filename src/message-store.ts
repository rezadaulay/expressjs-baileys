import { BufferJSON, proto } from 'baileys';
import { db } from './db.js';

// Store sent messages so they can be replayed when the recipient requests a retry.
// Without this, the recipient can get stuck on "waiting for this message".

db.exec(`
    CREATE TABLE IF NOT EXISTS sent_messages (
        session_id TEXT NOT NULL,
        msg_id     TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, msg_id)
    )
`);

// Retries are only relevant shortly after sending, so drop entries older than 7 days.
db.prepare('DELETE FROM sent_messages WHERE created_at < ?').run(Date.now() - 7 * 24 * 3600 * 1000);

const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO sent_messages (session_id, msg_id, message, created_at) VALUES (?, ?, ?, ?)'
);
const selectStmt = db.prepare('SELECT message FROM sent_messages WHERE session_id = ? AND msg_id = ?');

export function storeSentMessage(sessionId: string, msgId: string, message: proto.IMessage): void {
    insertStmt.run(sessionId, msgId, JSON.stringify(message, BufferJSON.replacer), Date.now());
}

export function getSentMessage(sessionId: string, msgId: string): proto.IMessage | undefined {
    const row = selectStmt.get(sessionId, msgId) as { message: string } | undefined;
    return row ? JSON.parse(row.message, BufferJSON.reviver) : undefined;
}
