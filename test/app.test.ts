// WA_DB_PATH=:memory: diset oleh script npm test — tidak bisa diset di sini
// karena import di-hoist sebelum assignment berjalan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { createApp } from '../src/app';
import { SESSION_NAME_RE } from '../src/session';

// Catatan: route yang menyentuh sesi valid akan memicu koneksi nyata ke WhatsApp,
// jadi test HTTP di sini hanya mencakup jalur yang tidak menyentuh jaringan.

async function withServer(
    env: Partial<Record<'WA_MODE' | 'WA_DEFAULT_SESSION' | 'WA_DEFAULT_COUNTRY_CODE', string | undefined>>,
    run: (baseUrl: string) => Promise<void>
): Promise<void> {
    const prevMode = process.env.WA_MODE;
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;
    const prevDefaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE;

    if (env.WA_MODE === undefined) {
        delete process.env.WA_MODE;
    } else {
        process.env.WA_MODE = env.WA_MODE;
    }

    if (env.WA_DEFAULT_SESSION === undefined) {
        delete process.env.WA_DEFAULT_SESSION;
    } else {
        process.env.WA_DEFAULT_SESSION = env.WA_DEFAULT_SESSION;
    }

    if (env.WA_DEFAULT_COUNTRY_CODE === undefined) {
        delete process.env.WA_DEFAULT_COUNTRY_CODE;
    } else {
        process.env.WA_DEFAULT_COUNTRY_CODE = env.WA_DEFAULT_COUNTRY_CODE;
    }

    let server: Server | undefined;

    try {
        server = createApp().listen(0);
        await new Promise((resolve) => server!.once('listening', resolve));
        const addr = server.address();
        if (addr === null || typeof addr === 'string') {
            throw new Error('unexpected server address');
        }
        await run(`http://127.0.0.1:${addr.port}`);
    } finally {
        server?.close();

        if (prevMode === undefined) {
            delete process.env.WA_MODE;
        } else {
            process.env.WA_MODE = prevMode;
        }

        if (prevDefaultSession === undefined) {
            delete process.env.WA_DEFAULT_SESSION;
        } else {
            process.env.WA_DEFAULT_SESSION = prevDefaultSession;
        }

        if (prevDefaultCountryCode === undefined) {
            delete process.env.WA_DEFAULT_COUNTRY_CODE;
        } else {
            process.env.WA_DEFAULT_COUNTRY_CODE = prevDefaultCountryCode;
        }
    }
}

test('mode single menjadi default dan /sessions nonaktif', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/sessions`);
        assert.equal(res.status, 404);
        assert.deepEqual(await res.json(), { error: 'endpoint /sessions hanya tersedia saat WA_MODE=multi' });
    });
});

test('GET /sessions tetap tersedia di mode multi', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/sessions`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), []);
    });
});

test('nama session dengan karakter tidak valid ditolak 400 di mode multi', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        for (const bad of ['bad%20name', 'a.b', 'x%2Fy']) {
            const res = await fetch(`${baseUrl}/${bad}/status`);
            assert.equal(res.status, 400, `"${bad}" harus ditolak`);
            const body = (await res.json()) as { error: string };
            assert.match(body.error, /nama session tidak valid/);
        }
    });
});

test('nama session lebih dari 32 karakter ditolak di mode multi', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/${'a'.repeat(33)}/status`);
        assert.equal(res.status, 400);
    });
});

test('countryCode query invalid ditolak sebelum cek koneksi WA', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/check-number?phone=081234567890&countryCode=%2B62`);
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'query param countryCode tidak valid' });
    });
});

test('countryCode body invalid ditolak di send-message', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '081234567890',
                message: 'tes',
                countryCode: '+62'
            })
        });
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'countryCode tidak valid' });
    });
});

test('countryCode body invalid ditolak di send-media', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/send-media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '081234567890',
                media: 'https://example.com/file.pdf',
                countryCode: '+62'
            })
        });
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'countryCode tidak valid' });
    });
});

test('SESSION_NAME_RE menerima nama yang wajar', () => {
    for (const ok of ['toko-a', 'CS_1', 'tenant123', 'a']) {
        assert.ok(SESSION_NAME_RE.test(ok), `"${ok}" harus valid`);
    }
    for (const bad of ['', 'a b', 'a/b', 'a.b', 'a'.repeat(33)]) {
        assert.ok(!SESSION_NAME_RE.test(bad), `"${bad}" harus ditolak`);
    }
});
