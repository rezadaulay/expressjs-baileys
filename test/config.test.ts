import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTenancyConfig } from '../src/config';

test('default tenancy is single with the "default" session', () => {
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

test('tenancy reads multi mode and a custom default session', () => {
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

test('invalid WA_DEFAULT_SESSION is rejected', () => {
    const prevDefaultSession = process.env.WA_DEFAULT_SESSION;

    process.env.WA_DEFAULT_SESSION = 'bad name';

    try {
        assert.throws(() => getTenancyConfig(), /WA_DEFAULT_SESSION is invalid/);
    } finally {
        if (prevDefaultSession === undefined) {
            delete process.env.WA_DEFAULT_SESSION;
        } else {
            process.env.WA_DEFAULT_SESSION = prevDefaultSession;
        }
    }
});

test('invalid WA_DEFAULT_COUNTRY_CODE is rejected', () => {
    const prevDefaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE;

    process.env.WA_DEFAULT_COUNTRY_CODE = '+62';

    try {
        assert.throws(() => getTenancyConfig(), /WA_DEFAULT_COUNTRY_CODE is invalid/);
    } finally {
        if (prevDefaultCountryCode === undefined) {
            delete process.env.WA_DEFAULT_COUNTRY_CODE;
        } else {
            process.env.WA_DEFAULT_COUNTRY_CODE = prevDefaultCountryCode;
        }
    }
});
