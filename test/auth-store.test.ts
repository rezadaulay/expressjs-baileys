// WA_DB_PATH=:memory: diset oleh script npm test — tidak bisa diset di sini
// karena import di-hoist sebelum assignment berjalan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useSQLiteAuthState } from '../src/auth-store';
import { db, listSessionIds } from '../src/db';

if (process.env.WA_DB_PATH !== ':memory:') {
    throw new Error('Test harus dijalankan via `npm test` agar memakai DB in-memory, bukan database asli');
}

test('creds baru dibuat untuk session yang belum ada', () => {
    const { state } = useSQLiteAuthState('fresh');
    assert.ok(state.creds.noiseKey);
    assert.ok(state.creds.signedIdentityKey);
    // belum disimpan sebelum saveCreds dipanggil
    assert.equal(listSessionIds().includes('fresh'), false);
});

test('saveCreds menyimpan dan Buffer utuh setelah dibaca ulang (roundtrip)', async () => {
    const store1 = useSQLiteAuthState('roundtrip');
    await store1.saveCreds();

    // buka ulang seolah server restart
    const store2 = useSQLiteAuthState('roundtrip');
    const orig = store1.state.creds.noiseKey;
    const loaded = store2.state.creds.noiseKey;

    assert.ok(Buffer.isBuffer(loaded.private), 'private key harus Buffer, bukan objek JSON');
    assert.ok(Buffer.from(orig.private).equals(Buffer.from(loaded.private)));
    assert.ok(Buffer.from(orig.public).equals(Buffer.from(loaded.public)));
    assert.equal(store1.state.creds.registrationId, store2.state.creds.registrationId);
});

test('keys.set lalu keys.get mengembalikan data yang sama', async () => {
    const { state } = useSQLiteAuthState('keys-test');
    const keyPair = {
        private: Buffer.from('a'.repeat(32)),
        public: Buffer.from('b'.repeat(32))
    };

    await state.keys.set({ 'pre-key': { '1': { keyPair, keyId: 1 } as any } });
    const result = await state.keys.get('pre-key', ['1']);

    assert.ok(result['1'], 'pre-key 1 harus ditemukan');
    const stored = result['1'] as any;
    assert.ok(Buffer.from(keyPair.private).equals(Buffer.from(stored.keyPair.private)));
});

test('keys.get untuk id yang tidak ada mengembalikan null', async () => {
    const { state } = useSQLiteAuthState('keys-test');
    const result = await state.keys.get('pre-key', ['999']);
    assert.equal(result['999'], null);
});

test('keys.set dengan value null menghapus key', async () => {
    const { state } = useSQLiteAuthState('keys-delete');
    await state.keys.set({ session: { abc: Buffer.from('data') as any } });

    let result = await state.keys.get('session', ['abc']);
    assert.ok(result['abc']);

    await state.keys.set({ session: { abc: null as any } });
    result = await state.keys.get('session', ['abc']);
    assert.equal(result['abc'], null);
});

test('data antar session terisolasi', async () => {
    const storeA = useSQLiteAuthState('tenant-a');
    const storeB = useSQLiteAuthState('tenant-b');

    await storeA.state.keys.set({ session: { shared: Buffer.from('milik-a') as any } });

    const fromB = await storeB.state.keys.get('session', ['shared']);
    assert.equal(fromB['shared'], null, 'tenant-b tidak boleh melihat data tenant-a');

    const fromA = await storeA.state.keys.get('session', ['shared']);
    assert.ok(fromA['shared']);
});

test('removeAll hanya menghapus session miliknya', async () => {
    const storeA = useSQLiteAuthState('rm-a');
    const storeB = useSQLiteAuthState('rm-b');
    await storeA.saveCreds();
    await storeB.saveCreds();

    assert.deepEqual(listSessionIds().filter((s) => s.startsWith('rm-')).sort(), ['rm-a', 'rm-b']);

    storeA.removeAll();

    assert.deepEqual(listSessionIds().filter((s) => s.startsWith('rm-')), ['rm-b']);
});

test('creds dimuat ulang identik setelah update + save kedua', async () => {
    const store1 = useSQLiteAuthState('resave');
    store1.state.creds.registered = true;
    await store1.saveCreds();
    await store1.saveCreds(); // upsert, bukan insert ganda

    const rows = db.prepare("SELECT COUNT(*) as n FROM auth_state WHERE session_id = 'resave'").get() as { n: number };
    assert.equal(rows.n, 1);

    const store2 = useSQLiteAuthState('resave');
    assert.equal(store2.state.creds.registered, true);
});
