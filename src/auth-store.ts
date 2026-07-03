import {
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    proto,
    SignalDataTypeMap
} from 'baileys';
import { db } from './db.js';

const selectStmt = db.prepare('SELECT value FROM auth_state WHERE session_id = ? AND key = ?');
const upsertStmt = db.prepare(
    'INSERT INTO auth_state (session_id, key, value) VALUES (?, ?, ?) ' +
    'ON CONFLICT (session_id, key) DO UPDATE SET value = excluded.value'
);
const deleteStmt = db.prepare('DELETE FROM auth_state WHERE session_id = ? AND key = ?');
const deleteAllStmt = db.prepare('DELETE FROM auth_state WHERE session_id = ?');

export interface SQLiteAuthState {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    removeAll: () => void;
}

// pengganti useMultiFileAuthState: auth state per session di tabel auth_state
export function useSQLiteAuthState(sessionId: string): SQLiteAuthState {
    const readData = (key: string): any => {
        const row = selectStmt.get(sessionId, key) as { value: string } | undefined;
        return row ? JSON.parse(row.value, BufferJSON.reviver) : null;
    };

    const writeData = (key: string, data: any): void => {
        upsertStmt.run(sessionId, key, JSON.stringify(data, BufferJSON.replacer));
    };

    const creds = readData('creds') || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
                    const data: { [id: string]: SignalDataTypeMap[T] } = {};
                    for (const id of ids) {
                        let value = readData(`${type}-${id}`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    const write = db.transaction(() => {
                        for (const category in data) {
                            const entries = data[category as keyof SignalDataTypeMap];
                            for (const id in entries) {
                                const value = entries[id];
                                const key = `${category}-${id}`;
                                if (value) {
                                    writeData(key, value);
                                } else {
                                    deleteStmt.run(sessionId, key);
                                }
                            }
                        }
                    });
                    write();
                }
            }
        },
        saveCreds: async () => {
            writeData('creds', creds);
        },
        removeAll: () => {
            deleteAllStmt.run(sessionId);
        }
    };
}
