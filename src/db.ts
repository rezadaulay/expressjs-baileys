import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

// Allow overriding via env for tests, e.g. ':memory:'.
const DB_PATH = process.env.WA_DB_PATH || './data/whatsapp.db';

if (DB_PATH !== ':memory:') {
    mkdirSync(dirname(DB_PATH), { recursive: true });
}

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS auth_state (
        session_id TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        PRIMARY KEY (session_id, key)
    )
`);

export function listSessionIds(): string[] {
    const rows = db.prepare('SELECT DISTINCT session_id FROM auth_state').all() as { session_id: string }[];
    return rows.map((r) => r.session_id);
}
