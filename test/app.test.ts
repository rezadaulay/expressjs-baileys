// WA_DB_PATH=:memory: diset oleh script npm test — tidak bisa diset di sini
// karena import di-hoist sebelum assignment berjalan
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { createApp, SESSION_NAME_RE } from '../src/app';

// Catatan: route dengan nama session valid akan memicu koneksi nyata ke WhatsApp,
// jadi test HTTP di sini hanya mencakup jalur yang tidak menyentuh jaringan.

let server: Server;
let baseUrl: string;

before(async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (addr === null || typeof addr === 'string') {
        throw new Error('unexpected server address');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(() => {
    server.close();
});

test('GET /sessions awalnya kosong', async () => {
    const res = await fetch(`${baseUrl}/sessions`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
});

test('nama session dengan karakter tidak valid ditolak 400', async () => {
    for (const bad of ['bad%20name', 'a.b', 'x%2Fy']) {
        const res = await fetch(`${baseUrl}/${bad}/status`);
        assert.equal(res.status, 400, `"${bad}" harus ditolak`);
        const body = (await res.json()) as { error: string };
        assert.match(body.error, /nama session tidak valid/);
    }
});

test('nama session lebih dari 32 karakter ditolak', async () => {
    const res = await fetch(`${baseUrl}/${'a'.repeat(33)}/status`);
    assert.equal(res.status, 400);
});

test('SESSION_NAME_RE menerima nama yang wajar', () => {
    for (const ok of ['toko-a', 'CS_1', 'tenant123', 'a']) {
        assert.ok(SESSION_NAME_RE.test(ok), `"${ok}" harus valid`);
    }
    for (const bad of ['', 'a b', 'a/b', 'a.b', 'a'.repeat(33)]) {
        assert.ok(!SESSION_NAME_RE.test(bad), `"${bad}" harus ditolak`);
    }
});
