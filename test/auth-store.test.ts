// WA_DB_PATH=:memory: is set by the npm test script and cannot be set here
// because imports are hoisted before runtime assignment happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useSQLiteAuthState } from '../src/auth-store';
import { db, listSessionIds } from '../src/db';

if (process.env.WA_DB_PATH !== ':memory:') {
    throw new Error('Tests must be run via `npm test` so they use the in-memory DB, not the real database');
}

test('new creds are created for a missing session', () => {
    const { state } = useSQLiteAuthState('fresh');
    assert.ok(state.creds.noiseKey);
    assert.ok(state.creds.signedIdentityKey);
    // Nothing is persisted until saveCreds is called.
    assert.equal(listSessionIds().includes('fresh'), false);
});

test('saveCreds persists data and preserves Buffers across reloads', async () => {
    const store1 = useSQLiteAuthState('roundtrip');
    await store1.saveCreds();

    // Reopen as if the server had restarted.
    const store2 = useSQLiteAuthState('roundtrip');
    const orig = store1.state.creds.noiseKey;
    const loaded = store2.state.creds.noiseKey;

    assert.ok(Buffer.isBuffer(loaded.private), 'private key should be a Buffer, not a JSON object');
    assert.ok(Buffer.from(orig.private).equals(Buffer.from(loaded.private)));
    assert.ok(Buffer.from(orig.public).equals(Buffer.from(loaded.public)));
    assert.equal(store1.state.creds.registrationId, store2.state.creds.registrationId);
});

test('keys.set followed by keys.get returns the same data', async () => {
    const { state } = useSQLiteAuthState('keys-test');
    const keyPair = {
        private: Buffer.from('a'.repeat(32)),
        public: Buffer.from('b'.repeat(32))
    };

    await state.keys.set({ 'pre-key': { '1': { keyPair, keyId: 1 } as any } });
    const result = await state.keys.get('pre-key', ['1']);

    assert.ok(result['1'], 'pre-key 1 should be found');
    const stored = result['1'] as any;
    assert.ok(Buffer.from(keyPair.private).equals(Buffer.from(stored.keyPair.private)));
});

test('keys.get returns null for a missing id', async () => {
    const { state } = useSQLiteAuthState('keys-test');
    const result = await state.keys.get('pre-key', ['999']);
    assert.equal(result['999'], null);
});

test('keys.set deletes a key when the value is null', async () => {
    const { state } = useSQLiteAuthState('keys-delete');
    await state.keys.set({ session: { abc: Buffer.from('data') as any } });

    let result = await state.keys.get('session', ['abc']);
    assert.ok(result['abc']);

    await state.keys.set({ session: { abc: null as any } });
    result = await state.keys.get('session', ['abc']);
    assert.equal(result['abc'], null);
});

test('data is isolated between sessions', async () => {
    const storeA = useSQLiteAuthState('tenant-a');
    const storeB = useSQLiteAuthState('tenant-b');

    await storeA.state.keys.set({ session: { shared: Buffer.from('owned-by-a') as any } });

    const fromB = await storeB.state.keys.get('session', ['shared']);
    assert.equal(fromB['shared'], null, 'tenant-b must not see tenant-a data');

    const fromA = await storeA.state.keys.get('session', ['shared']);
    assert.ok(fromA['shared']);
});

test('removeAll only deletes its own session', async () => {
    const storeA = useSQLiteAuthState('rm-a');
    const storeB = useSQLiteAuthState('rm-b');
    await storeA.saveCreds();
    await storeB.saveCreds();

    assert.deepEqual(listSessionIds().filter((s) => s.startsWith('rm-')).sort(), ['rm-a', 'rm-b']);

    storeA.removeAll();

    assert.deepEqual(listSessionIds().filter((s) => s.startsWith('rm-')), ['rm-b']);
});

test('creds reload identically after an update and a second save', async () => {
    const store1 = useSQLiteAuthState('resave');
    store1.state.creds.registered = true;
    await store1.saveCreds();
    await store1.saveCreds(); // upsert, not a duplicate insert

    const rows = db.prepare("SELECT COUNT(*) as n FROM auth_state WHERE session_id = 'resave'").get() as { n: number };
    assert.equal(rows.n, 1);

    const store2 = useSQLiteAuthState('resave');
    assert.equal(store2.state.creds.registered, true);
});
