import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../src/utils';

test('normalizePhone: awalan 0 diganti 62', () => {
    assert.equal(normalizePhone('081234567890'), '6281234567890');
});

test('normalizePhone: nomor 62 dibiarkan apa adanya', () => {
    assert.equal(normalizePhone('6281234567890'), '6281234567890');
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
