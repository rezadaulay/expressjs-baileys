// normalisasi: buang non-digit, awalan 0 jadi 62; null jika tidak valid
export function normalizePhone(phone: unknown): string | null {
    if (typeof phone !== 'string') {
        return null;
    }
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
        normalized = '62' + normalized.slice(1);
    }
    return /^\d{8,15}$/.test(normalized) ? normalized : null;
}
