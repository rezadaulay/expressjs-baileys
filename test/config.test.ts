import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTenancyConfig } from '../src/config';

test('tenancy default adalah single dengan session "default"', () => {
    const prevMode = process.env.WA_MODE;
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;
    const prevDefaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE;

    delete process.env.WA_MODE;
    delete process.env.WA_DEFAULT_SESSION;
    delete process.env.WA_DEFAULT_COUNTRY_CODE;

    try {
        assert.deepEqual(getTenancyConfig(), {
            mode: 'single',
            defaultSession: 'default',
            defaultCountryCode: '62'
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

        if (prevDefaultCountryCode === undefined) {
            delete process.env.WA_DEFAULT_COUNTRY_CODE;
        } else {
            process.env.WA_DEFAULT_COUNTRY_CODE = prevDefaultCountryCode;
        }
    }
});

test('tenancy membaca mode multi dan default session custom', () => {
    const prevMode = process.env.WA_MODE;
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;
    const prevDefaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE;

    process.env.WA_MODE = 'multi';
    process.env.WA_DEFAULT_SESSION = 'my-account';
    process.env.WA_DEFAULT_COUNTRY_CODE = '44';

    try {
        assert.deepEqual(getTenancyConfig(), {
            mode: 'multi',
            defaultSession: 'my-account',
            defaultCountryCode: '44'
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

        if (prevDefaultCountryCode === undefined) {
            delete process.env.WA_DEFAULT_COUNTRY_CODE;
        } else {
            process.env.WA_DEFAULT_COUNTRY_CODE = prevDefaultCountryCode;
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

test('WA_DEFAULT_COUNTRY_CODE invalid ditolak', () => {
    const prevDefaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE;

    process.env.WA_DEFAULT_COUNTRY_CODE = '+62';

    try {
        assert.throws(() => getTenancyConfig(), /WA_DEFAULT_COUNTRY_CODE tidak valid/);
    } finally {
        if (prevDefaultCountryCode === undefined) {
            delete process.env.WA_DEFAULT_COUNTRY_CODE;
        } else {
            process.env.WA_DEFAULT_COUNTRY_CODE = prevDefaultCountryCode;
        }
    }
});
