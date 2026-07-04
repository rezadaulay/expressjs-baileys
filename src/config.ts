import { SESSION_NAME_RE } from './session.js';

export type TenancyMode = 'single' | 'multi';

export type TenancyConfig = {
    mode: TenancyMode;
    defaultSession: string;
    defaultCountryCode: string;
};

export function isValidCountryCode(value: string): boolean {
    return /^\d{1,4}$/.test(value);
}

export function getTenancyConfig(): TenancyConfig {
    const rawMode = process.env.WA_MODE?.trim().toLowerCase();
    const mode: TenancyMode = rawMode === 'multi' ? 'multi' : 'single';
    const defaultSession = process.env.WA_DEFAULT_SESSION?.trim() || 'default';
    const defaultCountryCode = process.env.WA_DEFAULT_COUNTRY_CODE?.trim() || '62';

    if (!SESSION_NAME_RE.test(defaultSession)) {
        throw new Error('WA_DEFAULT_SESSION is invalid (letters/numbers/-/_, max 32 characters)');
    }

    if (!isValidCountryCode(defaultCountryCode)) {
        throw new Error('WA_DEFAULT_COUNTRY_CODE is invalid (digits only, length 1-4)');
    }

    return { mode, defaultSession, defaultCountryCode };
}
