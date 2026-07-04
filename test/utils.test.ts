import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, parseMediaAttachment } from '../src/utils';

test('normalizePhone: awalan 0 diganti 62', () => {
    assert.equal(normalizePhone('081234567890'), '6281234567890');
});

test('normalizePhone: awalan 0 memakai country code override', () => {
    assert.equal(normalizePhone('07911123456', '44'), '447911123456');
});

test('normalizePhone: nomor 62 dibiarkan apa adanya', () => {
    assert.equal(normalizePhone('6281234567890'), '6281234567890');
});

test('normalizePhone: nomor internasional tanpa awalan 0 dibiarkan', () => {
    assert.equal(normalizePhone('447911123456', '62'), '447911123456');
});

test('normalizePhone: karakter non-digit dibuang (+, spasi, strip)', () => {
    assert.equal(normalizePhone('+62 812-3456-7890'), '6281234567890');
    assert.equal(normalizePhone('0812 3456 7890'), '6281234567890');
});

test('normalizePhone: terlalu pendek atau terlalu panjang ditolak', () => {
    assert.equal(normalizePhone('08123'), null); // 6 digit setelah normalisasi
    assert.equal(normalizePhone('1234567'), null); // 7 digit
    assert.equal(normalizePhone('1234567890123456'), null); // 16 digit
});

test('normalizePhone: input bukan string ditolak', () => {
    assert.equal(normalizePhone(undefined), null);
    assert.equal(normalizePhone(null), null);
    assert.equal(normalizePhone(81234567890), null);
    assert.equal(normalizePhone({}), null);
});

test('normalizePhone: string tanpa digit ditolak', () => {
    assert.equal(normalizePhone('abc'), null);
    assert.equal(normalizePhone(''), null);
});

test('parseMediaAttachment: deteksi kind per ekstensi', () => {
    assert.equal(parseMediaAttachment('https://x.com/a.jpg')?.kind, 'image');
    assert.equal(parseMediaAttachment('https://x.com/a.png')?.kind, 'image');
    assert.equal(parseMediaAttachment('https://x.com/a.mp4')?.kind, 'video');
    assert.equal(parseMediaAttachment('https://x.com/a.mp3')?.kind, 'audio');
    assert.equal(parseMediaAttachment('https://x.com/a.pdf')?.kind, 'document');
    assert.equal(parseMediaAttachment('https://x.com/a.xlsx')?.kind, 'document');
});

test('parseMediaAttachment: mimetype OOXML modern yang benar', () => {
    assert.equal(
        parseMediaAttachment('https://x.com/laporan.docx')?.mimetype,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    assert.equal(
        parseMediaAttachment('https://x.com/data.xlsx')?.mimetype,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    assert.equal(parseMediaAttachment('https://x.com/lama.doc')?.mimetype, 'application/msword');
});

test('parseMediaAttachment: ekstensi asing jadi dokumen octet-stream', () => {
    const result = parseMediaAttachment('https://x.com/data.bin');
    assert.equal(result?.kind, 'document');
    assert.equal(result?.mimetype, 'application/octet-stream');
});

test('parseMediaAttachment: filename default dari URL, bisa dioverride', () => {
    assert.equal(parseMediaAttachment('https://x.com/dir/laporan.pdf')?.filename, 'laporan.pdf');
    assert.equal(parseMediaAttachment('https://x.com/laporan.pdf', 'Laporan Q1.pdf')?.filename, 'Laporan Q1.pdf');
});

test('parseMediaAttachment: query string tidak mengganggu deteksi', () => {
    const result = parseMediaAttachment('https://x.com/foto.jpg?token=abc&size=lg');
    assert.equal(result?.kind, 'image');
    assert.equal(result?.filename, 'foto.jpg');
});

test('parseMediaAttachment: URL tidak valid ditolak', () => {
    assert.equal(parseMediaAttachment('bukan-url'), null);
    assert.equal(parseMediaAttachment('ftp://x.com/a.pdf'), null);
    assert.equal(parseMediaAttachment('file:///etc/passwd'), null);
    assert.equal(parseMediaAttachment(undefined), null);
    assert.equal(parseMediaAttachment(123), null);
});
