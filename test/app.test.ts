// WA_DB_PATH=:memory: is set by the npm test script and cannot be set here
// because imports are hoisted before runtime assignment happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { createApp } from '../src/app';
import { SESSION_NAME_RE } from '../src/session';

// Note: routes that touch a valid session trigger a real WhatsApp connection,
// so these HTTP tests only cover paths that do not reach the network.

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

test('single mode is the default and /sessions is disabled', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/sessions`);
        assert.equal(res.status, 404);
        assert.deepEqual(await res.json(), { error: 'the /sessions endpoint is only available when WA_MODE=multi' });
    });
});

test('GET /sessions remains available in multi mode', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/sessions`);
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), []);
    });
});

test('invalid session name characters return 400 in multi mode', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        for (const bad of ['bad%20name', 'a.b', 'x%2Fy']) {
            const res = await fetch(`${baseUrl}/${bad}/status`);
            assert.equal(res.status, 400, `"${bad}" should be rejected`);
            const body = (await res.json()) as { error: string };
            assert.match(body.error, /invalid session name/);
        }
    });
});

test('session names longer than 32 characters are rejected in multi mode', async () => {
    await withServer({ WA_MODE: 'multi' }, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/${'a'.repeat(33)}/status`);
        assert.equal(res.status, 400);
    });
});

test('invalid countryCode query is rejected before checking the WhatsApp connection', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/check-number?phone=081234567890&countryCode=%2B62`);
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'invalid countryCode query parameter' });
    });
});

test('invalid body countryCode is rejected in send-message', async () => {
    await withServer({}, async (baseUrl) => {
        const res = await fetch(`${baseUrl}/send-message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: '081234567890',
                message: 'test',
                countryCode: '+62'
            })
        });
        assert.equal(res.status, 400);
        assert.deepEqual(await res.json(), { error: 'invalid countryCode' });
    });
});

test('invalid body countryCode is rejected in send-media', async () => {
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
        assert.deepEqual(await res.json(), { error: 'invalid countryCode' });
    });
});

test('SESSION_NAME_RE accepts reasonable names', () => {
    for (const ok of ['toko-a', 'CS_1', 'tenant123', 'a']) {
        assert.ok(SESSION_NAME_RE.test(ok), `"${ok}" should be valid`);
    }
    for (const bad of ['', 'a b', 'a/b', 'a.b', 'a'.repeat(33)]) {
        assert.ok(!SESSION_NAME_RE.test(bad), `"${bad}" should be rejected`);
    }
});
