import { BufferJSON } from 'baileys';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type AuthBucket = Record<string, string>;

export type OutboxStatus = 'pending' | 'processing' | 'delivered' | 'failed';
export interface OutboxEventRow { id: string; session_id: string; message_id: string; event_type: string; payload: string; status: OutboxStatus; attempts: number; next_attempt_at: number; last_error: string | null; delivered_at: number | null; created_at: number }
export interface IdempotentRequestRow { session_id: string; idempotency_key: string; request_hash: string; status: 'processing' | 'completed' | 'failed'; response_body: string | null; message_id: string | null; created_at: number; completed_at: number | null }

interface FileStoreData {
    auth_state: Record<string, AuthBucket>;
    sent_messages: Record<string, Record<string, { message: string; created_at: number }>>;
    outbox_events: Record<string, OutboxEventRow>;
    idempotent_requests: Record<string, Record<string, IdempotentRequestRow>>;
    meta: Record<string, string>;
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
    getMeta(key: string): string | undefined;
    setMeta(key: string, value: string): void;
    insertOutboxEvent(row: { id: string; sessionId: string; messageId: string; eventType: string; payload: string; nextAttemptAt: number; createdAt: number }): boolean;
    claimDueOutboxEvents(now: number, limit: number): OutboxEventRow[];
    markOutboxDelivered(id: string, attempts: number, deliveredAt: number): void;
    markOutboxRetry(id: string, attempts: number, nextAttemptAt: number, lastError: string): void;
    markOutboxFailed(id: string, attempts: number, lastError: string): void;
    resetProcessingOutboxEvents(): number;
    deleteExpiredOutboxEvents(before: number): void;
    getIdempotentRequest(sessionId: string, key: string): IdempotentRequestRow | undefined;
    insertIdempotentRequest(row: { sessionId: string; idempotencyKey: string; requestHash: string; createdAt: number }): boolean;
    updateIdempotentRequest(sessionId: string, key: string, patch: { status: 'completed' | 'failed' | 'processing'; responseBody?: string; messageId?: string; completedAt?: number; createdAt?: number }): void;
    deleteExpiredIdempotentRequests(before: number): void;
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

    getMeta(key: string) { return this.data.meta[key]; }
    setMeta(key: string, value: string) { this.data.meta[key] = value; this.persist(); }
    private outboxById(id: string) { return Object.values(this.data.outbox_events).find((row) => row.id === id); }
    insertOutboxEvent(row: { id: string; sessionId: string; messageId: string; eventType: string; payload: string; nextAttemptAt: number; createdAt: number }): boolean {
        const key = `${row.sessionId}\0${row.messageId}\0${row.eventType}`;
        if (this.data.outbox_events[key]) return false;
        this.data.outbox_events[key] = { id: row.id, session_id: row.sessionId, message_id: row.messageId, event_type: row.eventType, payload: row.payload, status: 'pending', attempts: 0, next_attempt_at: row.nextAttemptAt, last_error: null, delivered_at: null, created_at: row.createdAt };
        this.persist(); return true;
    }
    claimDueOutboxEvents(now: number, limit: number): OutboxEventRow[] {
        const rows = Object.values(this.data.outbox_events).filter((r) => r.status === 'pending' && r.next_attempt_at <= now).sort((a,b) => a.next_attempt_at - b.next_attempt_at || a.created_at - b.created_at).slice(0, limit);
        for (const row of rows) row.status = 'processing';
        if (rows.length) this.persist(); return rows.map((r) => ({ ...r }));
    }
    markOutboxDelivered(id: string, attempts: number, deliveredAt: number) { const row=this.outboxById(id); if(row){ row.status='delivered'; row.attempts=attempts; row.delivered_at=deliveredAt; row.last_error=null; this.persist(); } }
    markOutboxRetry(id: string, attempts: number, nextAttemptAt: number, lastError: string) { const row=this.outboxById(id); if(row){ row.status='pending'; row.attempts=attempts; row.next_attempt_at=nextAttemptAt; row.last_error=lastError; this.persist(); } }
    markOutboxFailed(id: string, attempts: number, lastError: string) { const row=this.outboxById(id); if(row){ row.status='failed'; row.attempts=attempts; row.last_error=lastError; this.persist(); } }
    resetProcessingOutboxEvents(): number { let count=0; for(const row of Object.values(this.data.outbox_events)) if(row.status==='processing'){row.status='pending';count++;} if(count)this.persist(); return count; }
    deleteExpiredOutboxEvents(before: number) { for(const [key,row] of Object.entries(this.data.outbox_events)) if((row.status==='delivered'||row.status==='failed')&&row.created_at<before) delete this.data.outbox_events[key]; this.persist(); }
    getIdempotentRequest(sessionId: string, key: string) { return this.data.idempotent_requests[sessionId]?.[key]; }
    insertIdempotentRequest(row: { sessionId: string; idempotencyKey: string; requestHash: string; createdAt: number }): boolean { this.data.idempotent_requests[row.sessionId] ??={}; if(this.data.idempotent_requests[row.sessionId][row.idempotencyKey])return false; this.data.idempotent_requests[row.sessionId][row.idempotencyKey]={session_id:row.sessionId,idempotency_key:row.idempotencyKey,request_hash:row.requestHash,status:'processing',response_body:null,message_id:null,created_at:row.createdAt,completed_at:null};this.persist();return true; }
    updateIdempotentRequest(sessionId: string,key: string,patch: { status:'completed'|'failed'|'processing';responseBody?:string;messageId?:string;completedAt?:number;createdAt?:number }) { const row=this.data.idempotent_requests[sessionId]?.[key];if(!row)return;row.status=patch.status;if(patch.responseBody!==undefined)row.response_body=patch.responseBody;if(patch.messageId!==undefined)row.message_id=patch.messageId;if(patch.completedAt!==undefined)row.completed_at=patch.completedAt;if(patch.createdAt!==undefined)row.created_at=patch.createdAt;this.persist(); }
    deleteExpiredIdempotentRequests(before:number){for(const [sid,rows] of Object.entries(this.data.idempotent_requests)){for(const [key,row] of Object.entries(rows))if(row.created_at<before)delete rows[key];if(!Object.keys(rows).length)delete this.data.idempotent_requests[sid];}this.persist();}

    private load(): FileStoreData {
        if (!existsSync(this.path)) {
            return { auth_state: {}, sent_messages: {}, outbox_events: {}, idempotent_requests: {}, meta: {} };
        }

        const data = JSON.parse(readFileSync(this.path, 'utf8'), BufferJSON.reviver) as FileStoreData;
        data.auth_state ??= {}; data.sent_messages ??= {}; data.outbox_events ??= {}; data.idempotent_requests ??= {}; data.meta ??= {};
        return data;
    }

    private persist(): void {
        mkdirSync(dirname(this.path), { recursive: true });
        const tmpPath = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
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
            CREATE TABLE IF NOT EXISTS outbox_events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message_id TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, last_error TEXT, delivered_at INTEGER, created_at INTEGER NOT NULL, UNIQUE(session_id,message_id,event_type));
            CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox_events(status,next_attempt_at);
            CREATE TABLE IF NOT EXISTS idempotent_requests (session_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_hash TEXT NOT NULL,status TEXT NOT NULL,response_body TEXT,message_id TEXT,created_at INTEGER NOT NULL,completed_at INTEGER,PRIMARY KEY(session_id,idempotency_key));
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
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
    getMeta(key:string){return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;}
    setMeta(key:string,value:string){this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);}
    insertOutboxEvent(r:{id:string;sessionId:string;messageId:string;eventType:string;payload:string;nextAttemptAt:number;createdAt:number}){return this.db.prepare('INSERT INTO outbox_events(id,session_id,message_id,event_type,payload,next_attempt_at,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id,message_id,event_type) DO NOTHING').run(r.id,r.sessionId,r.messageId,r.eventType,r.payload,r.nextAttemptAt,r.createdAt).changes===1;}
    claimDueOutboxEvents(now:number,limit:number):OutboxEventRow[]{return this.db.transaction(()=>{const rows=this.db.prepare("SELECT * FROM outbox_events WHERE status='pending' AND next_attempt_at<=? ORDER BY next_attempt_at,created_at LIMIT ?").all(now,limit) as OutboxEventRow[];const update=this.db.prepare("UPDATE outbox_events SET status='processing' WHERE id=? AND status='pending'");return rows.filter(r=>update.run(r.id).changes===1);})();}
    markOutboxDelivered(id:string,attempts:number,deliveredAt:number){this.db.prepare("UPDATE outbox_events SET status='delivered',attempts=?,delivered_at=?,last_error=NULL WHERE id=?").run(attempts,deliveredAt,id);}
    markOutboxRetry(id:string,attempts:number,next:number,error:string){this.db.prepare("UPDATE outbox_events SET status='pending',attempts=?,next_attempt_at=?,last_error=? WHERE id=?").run(attempts,next,error,id);}
    markOutboxFailed(id:string,attempts:number,error:string){this.db.prepare("UPDATE outbox_events SET status='failed',attempts=?,last_error=? WHERE id=?").run(attempts,error,id);}
    resetProcessingOutboxEvents(){return this.db.prepare("UPDATE outbox_events SET status='pending' WHERE status='processing'").run().changes;}
    deleteExpiredOutboxEvents(before:number){this.db.prepare("DELETE FROM outbox_events WHERE status IN ('delivered','failed') AND created_at<?").run(before);}
    getIdempotentRequest(sessionId:string,key:string){return this.db.prepare('SELECT * FROM idempotent_requests WHERE session_id=? AND idempotency_key=?').get(sessionId,key) as IdempotentRequestRow|undefined;}
    insertIdempotentRequest(r:{sessionId:string;idempotencyKey:string;requestHash:string;createdAt:number}){return this.db.prepare("INSERT INTO idempotent_requests(session_id,idempotency_key,request_hash,status,created_at) VALUES(?,?,?,'processing',?) ON CONFLICT(session_id,idempotency_key) DO NOTHING").run(r.sessionId,r.idempotencyKey,r.requestHash,r.createdAt).changes===1;}
    updateIdempotentRequest(sessionId:string,key:string,p:{status:'completed'|'failed'|'processing';responseBody?:string;messageId?:string;completedAt?:number;createdAt?:number}){const fields=['status=?'],values:any[]=[p.status];for(const [name,val] of [['response_body',p.responseBody],['message_id',p.messageId],['completed_at',p.completedAt],['created_at',p.createdAt]] as const)if(val!==undefined){fields.push(`${name}=?`);values.push(val);}values.push(sessionId,key);this.db.prepare(`UPDATE idempotent_requests SET ${fields.join(',')} WHERE session_id=? AND idempotency_key=?`).run(...values);}
    deleteExpiredIdempotentRequests(before:number){this.db.prepare('DELETE FROM idempotent_requests WHERE created_at<?').run(before);}
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
