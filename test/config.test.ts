import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTenancyConfig } from '../src/config';

test('tenancy default adalah single dengan session "default"', () => {
    const prevMode = process.env.WA_MODE;
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;

    delete process.env.WA_MODE;
    delete process.env.WA_DEFAULT_SESSION;

    try {
        assert.deepEqual(getTenancyConfig(), {
            mode: 'single',
            defaultSession: 'default'
        });
    } finally {
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
    }
});

test('tenancy membaca mode multi dan default session custom', () => {
    const prevMode = process.env.WA_MODE;
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;

    process.env.WA_MODE = 'multi';
    process.env.WA_DEFAULT_SESSION = 'my-account';

    try {
        assert.deepEqual(getTenancyConfig(), {
            mode: 'multi',
            defaultSession: 'my-account'
        });
    } finally {
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
    }
});

test('WA_DEFAULT_SESSION invalid ditolak', () => {
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;

    process.env.WA_DEFAULT_SESSION = 'bad name';

    try {
        assert.throws(() => getTenancyConfig(), /WA_DEFAULT_SESSION tidak valid/);
    } finally {
        if (prevDefaultSession === undefined) {
            delete process.env.WA_DEFAULT_SESSION;
        } else {
            process.env.WA_DEFAULT_SESSION = prevDefaultSession;
        }
    }
});
