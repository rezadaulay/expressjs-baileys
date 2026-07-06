import { store } from './storage.js';

export function listSessionIds(): string[] {
    return store.listSessionIds();
}

export function countAuthRows(sessionId: string): number {
    return store.countAuthRows(sessionId);
}
