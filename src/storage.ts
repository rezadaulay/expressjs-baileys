import { BufferJSON } from 'baileys';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type AuthBucket = Record<string, string>;

interface FileStoreData {
    auth_state: Record<string, AuthBucket>;
    sent_messages: Record<string, Record<string, { message: string; created_at: number }>>;
}

export interface Store {
    getAuth(sessionId: string, key: string): string | undefined;
    setAuth(sessionId: string, key: string, value: string): void;
    deleteAuth(sessionId: string, key: string): void;
    deleteAuthSession(sessionId: string): void;
    listSessionIds(): string[];
    countAuthRows(sessionId: string): number;
    transaction<T>(fn: () => T): T;
    setSentMessage(sessionId: string, msgId: string, message: string, createdAt: number): void;
    getSentMessage(sessionId: string, msgId: string): string | undefined;
    deleteExpiredSentMessages(before: number): void;
}

const STORAGE_DRIVER = (process.env.WA_STORAGE_DRIVER || 'file').toLowerCase();
const FILE_STORE_PATH = process.env.WA_FILE_STORE_PATH || './data/whatsapp-store.json';
const SQLITE_DB_PATH = process.env.WA_DB_PATH || './data/whatsapp.db';

class FileStore implements Store {
    private data: FileStoreData;

    constructor(private readonly path: string) {
        this.data = this.load();
    }

    getAuth(sessionId: string, key: string): string | undefined {
        return this.data.auth_state[sessionId]?.[key];
    }

    setAuth(sessionId: string, key: string, value: string): void {
        this.data.auth_state[sessionId] ??= {};
        this.data.auth_state[sessionId][key] = value;
        this.persist();
    }

    deleteAuth(sessionId: string, key: string): void {
        delete this.data.auth_state[sessionId]?.[key];
        if (this.data.auth_state[sessionId] && Object.keys(this.data.auth_state[sessionId]).length === 0) {
            delete this.data.auth_state[sessionId];
        }
        this.persist();
    }

    deleteAuthSession(sessionId: string): void {
        delete this.data.auth_state[sessionId];
        this.persist();
    }

    listSessionIds(): string[] {
        return Object.keys(this.data.auth_state);
    }

    countAuthRows(sessionId: string): number {
        return Object.keys(this.data.auth_state[sessionId] ?? {}).length;
    }

    transaction<T>(fn: () => T): T {
        const result = fn();
        this.persist();
        return result;
    }

    setSentMessage(sessionId: string, msgId: string, message: string, createdAt: number): void {
        this.data.sent_messages[sessionId] ??= {};
        this.data.sent_messages[sessionId][msgId] = { message, created_at: createdAt };
        this.persist();
    }

    getSentMessage(sessionId: string, msgId: string): string | undefined {
        return this.data.sent_messages[sessionId]?.[msgId]?.message;
    }

    deleteExpiredSentMessages(before: number): void {
        for (const [sessionId, messages] of Object.entries(this.data.sent_messages)) {
            for (const [msgId, row] of Object.entries(messages)) {
                if (row.created_at < before) {
                    delete messages[msgId];
                }
            }
            if (Object.keys(messages).length === 0) {
                delete this.data.sent_messages[sessionId];
            }
        }
        this.persist();
    }

    private load(): FileStoreData {
        if (!existsSync(this.path)) {
            return { auth_state: {}, sent_messages: {} };
        }

        return JSON.parse(readFileSync(this.path, 'utf8'), BufferJSON.reviver);
    }

    private persist(): void {
        mkdirSync(dirname(this.path), { recursive: true });
        const tmpPath = `${this.path}.tmp`;
        writeFileSync(tmpPath, JSON.stringify(this.data, BufferJSON.replacer, 2));
        renameSync(tmpPath, this.path);
    }
}

class SQLiteStore implements Store {
    private readonly db: any;

    constructor(dbPath: string) {
        if (dbPath !== ':memory:') {
            mkdirSync(dirname(dbPath), { recursive: true });
        }

        const require = createRequire(import.meta.url);
        let Database: any;
        try {
            Database = require('better-sqlite3');
        } catch (error) {
            throw new Error(
                'WA_STORAGE_DRIVER=sqlite requires the optional better-sqlite3 package. Install it with `npm install better-sqlite3`, or use WA_STORAGE_DRIVER=file.'
            );
        }

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS auth_state (
                session_id TEXT NOT NULL,
                key        TEXT NOT NULL,
                value      TEXT NOT NULL,
                PRIMARY KEY (session_id, key)
            );
            CREATE TABLE IF NOT EXISTS sent_messages (
                session_id TEXT NOT NULL,
                msg_id     TEXT NOT NULL,
                message    TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (session_id, msg_id)
            );
        `);
    }

    getAuth(sessionId: string, key: string): string | undefined {
        const row = this.db.prepare('SELECT value FROM auth_state WHERE session_id = ? AND key = ?').get(sessionId, key);
        return row?.value;
    }

    setAuth(sessionId: string, key: string, value: string): void {
        this.db.prepare(
            'INSERT INTO auth_state (session_id, key, value) VALUES (?, ?, ?) ' +
            'ON CONFLICT (session_id, key) DO UPDATE SET value = excluded.value'
        ).run(sessionId, key, value);
    }

    deleteAuth(sessionId: string, key: string): void {
        this.db.prepare('DELETE FROM auth_state WHERE session_id = ? AND key = ?').run(sessionId, key);
    }

    deleteAuthSession(sessionId: string): void {
        this.db.prepare('DELETE FROM auth_state WHERE session_id = ?').run(sessionId);
    }

    listSessionIds(): string[] {
        const rows = this.db.prepare('SELECT DISTINCT session_id FROM auth_state').all() as { session_id: string }[];
        return rows.map((r) => r.session_id);
    }

    countAuthRows(sessionId: string): number {
        const row = this.db.prepare('SELECT COUNT(*) as n FROM auth_state WHERE session_id = ?').get(sessionId) as { n: number };
        return row.n;
    }

    transaction<T>(fn: () => T): T {
        return this.db.transaction(fn)();
    }

    setSentMessage(sessionId: string, msgId: string, message: string, createdAt: number): void {
        this.db.prepare(
            'INSERT OR REPLACE INTO sent_messages (session_id, msg_id, message, created_at) VALUES (?, ?, ?, ?)'
        ).run(sessionId, msgId, message, createdAt);
    }

    getSentMessage(sessionId: string, msgId: string): string | undefined {
        const row = this.db.prepare('SELECT message FROM sent_messages WHERE session_id = ? AND msg_id = ?').get(sessionId, msgId);
        return row?.message;
    }

    deleteExpiredSentMessages(before: number): void {
        this.db.prepare('DELETE FROM sent_messages WHERE created_at < ?').run(before);
    }
}

if (!['file', 'sqlite'].includes(STORAGE_DRIVER)) {
    throw new Error(`Invalid WA_STORAGE_DRIVER="${STORAGE_DRIVER}". Use "file" or "sqlite".`);
}

export const store: Store = STORAGE_DRIVER === 'sqlite'
    ? new SQLiteStore(SQLITE_DB_PATH)
    : new FileStore(FILE_STORE_PATH);

export function getStorageInfo(): { driver: string; path: string } {
    return STORAGE_DRIVER === 'sqlite'
        ? { driver: 'sqlite', path: SQLITE_DB_PATH }
        : { driver: 'file', path: FILE_STORE_PATH };
}
