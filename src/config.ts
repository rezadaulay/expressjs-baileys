import { SESSION_NAME_RE } from './session.js';

export type TenancyMode = 'single' | 'multi';

export type TenancyConfig = {
    mode: TenancyMode;
    defaultSession: string;
};

export function getTenancyConfig(): TenancyConfig {
    const rawMode = process.env.WA_MODE?.trim().toLowerCase();
    const mode: TenancyMode = rawMode === 'multi' ? 'multi' : 'single';
    const defaultSession = process.env.WA_DEFAULT_SESSION?.trim() || 'default';

    if (!SESSION_NAME_RE.test(defaultSession)) {
        throw new Error('WA_DEFAULT_SESSION tidak valid (huruf/angka/-/_, maks 32 karakter)');
    }

    return { mode, defaultSession };
}
