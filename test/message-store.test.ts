// WA_DB_PATH=:memory: diset oleh script npm test — tidak bisa diset di sini
// karena import di-hoist sebelum assignment berjalan
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeSentMessage, getSentMessage } from '../src/message-store';

if (process.env.WA_DB_PATH !== ':memory:') {
    throw new Error('Test harus dijalankan via `npm test` agar memakai DB in-memory, bukan database asli');
}

test('pesan tersimpan bisa diambil kembali utuh', () => {
    const message = { conversation: 'halo dunia' };
    storeSentMessage('tenant-x', 'MSG1', message);

    assert.deepEqual(getSentMessage('tenant-x', 'MSG1'), message);
});

test('pesan dengan Buffer (media key) tetap utuh setelah roundtrip', () => {
    const message = {
        imageMessage: {
            url: 'https://mmg.whatsapp.net/x',
            mediaKey: Buffer.from('kunci-rahasia-32-byte'.padEnd(32, 'x')),
            caption: 'tes'
        }
    } as any;
    storeSentMessage('tenant-x', 'MSG2', message);

    const loaded = getSentMessage('tenant-x', 'MSG2') as any;
    assert.ok(Buffer.isBuffer(loaded.imageMessage.mediaKey));
    assert.ok(message.imageMessage.mediaKey.equals(loaded.imageMessage.mediaKey));
});

test('pesan tidak ditemukan mengembalikan undefined', () => {
    assert.equal(getSentMessage('tenant-x', 'TIDAK-ADA'), undefined);
});

test('message store terisolasi antar session', () => {
    storeSentMessage('tenant-p', 'SAMA', { conversation: 'punya P' });
    storeSentMessage('tenant-q', 'SAMA', { conversation: 'punya Q' });

    assert.deepEqual(getSentMessage('tenant-p', 'SAMA'), { conversation: 'punya P' });
    assert.deepEqual(getSentMessage('tenant-q', 'SAMA'), { conversation: 'punya Q' });
});
