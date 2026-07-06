import {
    AuthenticationState,
    BufferJSON,
    initAuthCreds,
    proto,
    SignalDataTypeMap
} from 'baileys';
import { store } from './storage.js';

export interface PersistentAuthState {
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    removeAll: () => void;
}

// pengganti useMultiFileAuthState: auth state per session di storage persisten
export function usePersistentAuthState(sessionId: string): PersistentAuthState {
    const readData = (key: string): any => {
        const value = store.getAuth(sessionId, key);
        return value ? JSON.parse(value, BufferJSON.reviver) : null;
    };

    const writeData = (key: string, data: any): void => {
        store.setAuth(sessionId, key, JSON.stringify(data, BufferJSON.replacer));
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
                    store.transaction(() => {
                        for (const category in data) {
                            const entries = data[category as keyof SignalDataTypeMap];
                            for (const id in entries) {
                                const value = entries[id];
                                const key = `${category}-${id}`;
                                if (value) {
                                    writeData(key, value);
                                } else {
                                    store.deleteAuth(sessionId, key);
                                }
                            }
                        }
                    });
                }
            }
        },
        saveCreds: async () => {
            writeData('creds', creds);
        },
        removeAll: () => {
            store.deleteAuthSession(sessionId);
        }
    };
}

export const useSQLiteAuthState = usePersistentAuthState;
export type SQLiteAuthState = PersistentAuthState;
