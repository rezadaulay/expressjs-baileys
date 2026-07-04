import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, parseMediaAttachment } from '../src/utils';

test('normalizePhone: leading 0 is replaced with 62', () => {
    assert.equal(normalizePhone('081234567890'), '6281234567890');
});

test('normalizePhone: leading 0 uses the override country code', () => {
    assert.equal(normalizePhone('07911123456', '44'), '447911123456');
});

test('normalizePhone: numbers already starting with 62 stay unchanged', () => {
    assert.equal(normalizePhone('6281234567890'), '6281234567890');
});

test('normalizePhone: international numbers without a leading 0 stay unchanged', () => {
    assert.equal(normalizePhone('447911123456', '62'), '447911123456');
});

test('normalizePhone: non-digit characters are stripped (+, spaces, dashes)', () => {
    assert.equal(normalizePhone('+62 812-3456-7890'), '6281234567890');
    assert.equal(normalizePhone('0812 3456 7890'), '6281234567890');
});

test('normalizePhone: values that are too short or too long are rejected', () => {
    assert.equal(normalizePhone('08123'), null); // 6 digits after normalization
    assert.equal(normalizePhone('1234567'), null); // 7 digits
    assert.equal(normalizePhone('1234567890123456'), null); // 16 digits
});

test('normalizePhone: non-string input is rejected', () => {
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(81234567890), null);
    assert.equal(normalizePhone({}), null);
});

test('normalizePhone: strings without digits are rejected', () => {
    assert.equal(normalizePhone('abc'), null);
    assert.equal(normalizePhone(''), null);
});

test('parseMediaAttachment: detects kind from the extension', () => {
    assert.equal(parseMediaAttachment('https://x.com/a.jpg')?.kind, 'image');
    assert.equal(parseMediaAttachment('https://x.com/a.png')?.kind, 'image');
    assert.equal(parseMediaAttachment('https://x.com/a.mp4')?.kind, 'video');
    assert.equal(parseMediaAttachment('https://x.com/a.mp3')?.kind, 'audio');
    assert.equal(parseMediaAttachment('https://x.com/a.pdf')?.kind, 'document');
    assert.equal(parseMediaAttachment('https://x.com/a.xlsx')?.kind, 'document');
});

test('parseMediaAttachment: returns the correct modern OOXML mimetype', () => {
    assert.equal(
        parseMediaAttachment('https://x.com/report.docx')?.mimetype,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.equal(
        parseMediaAttachment('https://x.com/data.xlsx')?.mimetype,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert.equal(parseMediaAttachment('https://x.com/legacy.doc')?.mimetype, 'application/msword');
});

test('parseMediaAttachment: unknown extensions fall back to octet-stream documents', () => {
    const result = parseMediaAttachment('https://x.com/data.bin');
    assert.equal(result?.kind, 'document');
    assert.equal(result?.mimetype, 'application/octet-stream');
});

test('parseMediaAttachment: the default filename comes from the URL and can be overridden', () => {
    assert.equal(parseMediaAttachment('https://x.com/dir/report.pdf')?.filename, 'report.pdf');
    assert.equal(parseMediaAttachment('https://x.com/report.pdf', 'Q1 Report.pdf')?.filename, 'Q1 Report.pdf');
});

test('parseMediaAttachment: query strings do not affect detection', () => {
    const result = parseMediaAttachment('https://x.com/photo.jpg?token=abc&size=lg');
    assert.equal(result?.kind, 'image');
    assert.equal(result?.filename, 'photo.jpg');
});

test('parseMediaAttachment: invalid URLs are rejected', () => {
    assert.equal(parseMediaAttachment('not-a-url'), null);
    assert.equal(parseMediaAttachment('ftp://x.com/a.pdf'), null);
    assert.equal(parseMediaAttachment('file:///etc/passwd'), null);
    assert.equal(parseMediaAttachment(undefined), null);
    assert.equal(parseMediaAttachment(123), null);
});
