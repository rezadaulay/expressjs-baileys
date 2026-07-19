import { SESSION_NAME_RE } from './session.js';

export type TenancyMode = 'single' | 'multi';

export type TenancyConfig = {
    mode: TenancyMode;
    defaultSession: string;
    defaultCountryCode: string;
};

export type WebhookConfig =
    | { enabled: false }
    | { enabled: true; url: string; secret: string; timeoutMs: number; maxAttempts: number;
        includeGroups: boolean; includeFromMe: boolean; processAppend: boolean };

const truthy = (value: string | undefined): boolean => ['true', '1', 'yes'].includes(value?.trim().toLowerCase() ?? '');

export function getWebhookConfig(): WebhookConfig {
    if (!truthy(process.env.WA_WEBHOOK_ENABLED)) return { enabled: false };
    const url = process.env.WA_WEBHOOK_URL?.trim();
    const secret = process.env.WA_WEBHOOK_SECRET?.trim();
    if (!url) throw new Error('WA_WEBHOOK_URL is required when webhooks are enabled');
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
        throw new Error('WA_WEBHOOK_URL must be a valid http/https URL');
    }
    if (!secret) throw new Error('WA_WEBHOOK_SECRET is required when webhooks are enabled');
    const positiveInteger = (name: string, fallback: number): number => {
        const raw = process.env[name];
        if (raw === undefined || raw.trim() === '') return fallback;
        const value = Number(raw);
        if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
        return value;
    };
    return {
        enabled: true, url, secret,
        timeoutMs: positiveInteger('WA_WEBHOOK_TIMEOUT_MS', 10000),
        maxAttempts: positiveInteger('WA_WEBHOOK_MAX_ATTEMPTS', 8),
        includeGroups: truthy(process.env.WA_WEBHOOK_INCLUDE_GROUPS),
        includeFromMe: truthy(process.env.WA_WEBHOOK_INCLUDE_FROM_ME),
        processAppend: process.env.WA_WEBHOOK_PROCESS_APPEND === undefined || truthy(process.env.WA_WEBHOOK_PROCESS_APPEND)
    };
}

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
