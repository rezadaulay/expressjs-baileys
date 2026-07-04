// Normalize by stripping non-digits. Numbers starting with 0 are converted to the
// default/requested country code. Already-international numbers are left as-is.
export function normalizePhone(phone: unknown, countryCode = '62'): string | null {
    if (typeof phone !== 'string') {
        return null;
    }
    let normalized = phone.replace(/\D/g, '');
    if (normalized.startsWith('0')) {
        normalized = countryCode + normalized.slice(1);
    }
    return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

export interface MediaAttachment {
    kind: MediaKind;
    url: string;
    filename: string;
    mimetype: string;
}

const MEDIA_KINDS: { [ext: string]: { kind: MediaKind; mimetype: string } } = {
    png: { kind: 'image', mimetype: 'image/png' },
    jpg: { kind: 'image', mimetype: 'image/jpeg' },
    jpeg: { kind: 'image', mimetype: 'image/jpeg' },
    mp4: { kind: 'video', mimetype: 'video/mp4' },
    mp3: { kind: 'audio', mimetype: 'audio/mpeg' },
    ogg: { kind: 'audio', mimetype: 'audio/ogg; codecs=opus' },
    m4a: { kind: 'audio', mimetype: 'audio/mp4' },
    pdf: { kind: 'document', mimetype: 'application/pdf' },
    csv: { kind: 'document', mimetype: 'text/csv' },
    txt: { kind: 'document', mimetype: 'text/plain' },
    zip: { kind: 'document', mimetype: 'application/zip' },
    doc: { kind: 'document', mimetype: 'application/msword' },
    docx: { kind: 'document', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    xls: { kind: 'document', mimetype: 'application/vnd.ms-excel' },
    xlsx: { kind: 'document', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ppt: { kind: 'document', mimetype: 'application/vnd.ms-powerpoint' },
    pptx: { kind: 'document', mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }
};

// Detect the media type from the URL path extension; return null for invalid URLs.
// Unknown extensions are sent as application/octet-stream documents.
export function parseMediaAttachment(mediaUrl: unknown, filename?: unknown): MediaAttachment | null {
    if (typeof mediaUrl !== 'string') {
        return null;
    }
    let pathname: string;
    try {
        const url = new URL(mediaUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return null;
        }
        pathname = url.pathname;
    } catch {
        return null;
    }

    const basename = decodeURIComponent(pathname.split('/').pop() || '');
    const ext = basename.includes('.') ? basename.split('.').pop()!.toLowerCase() : '';
    const media = MEDIA_KINDS[ext] ?? { kind: 'document' as MediaKind, mimetype: 'application/octet-stream' };

    const name = typeof filename === 'string' && filename.trim() ? filename.trim() : basename || 'file';
    return { kind: media.kind, url: mediaUrl, filename: name, mimetype: media.mimetype };
}
