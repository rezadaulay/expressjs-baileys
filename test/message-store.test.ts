// WA_FILE_STORE_PATH is set by the npm test script and cannot be set here
// because imports are hoisted before runtime assignment happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storeSentMessage, getSentMessage } from '../src/message-store';

if (process.env.WA_STORAGE_DRIVER !== 'file' || !process.env.WA_FILE_STORE_PATH?.includes('/tmp/')) {
    throw new Error('Tests must be run via `npm test` so they use a temporary file store, not real data');
}

test('a stored message can be retrieved intact', () => {
    const message = { conversation: 'hello world' };
    storeSentMessage('tenant-x', 'MSG1', message);

    assert.deepEqual(getSentMessage('tenant-x', 'MSG1'), message);
});

test('a message with a Buffer media key survives a roundtrip intact', () => {
    const message = {
        imageMessage: {
            url: 'https://mmg.whatsapp.net/x',
            mediaKey: Buffer.from('secret-32-byte-media-key'.padEnd(32, 'x')),
            caption: 'test'
        }
    } as any;
    storeSentMessage('tenant-x', 'MSG2', message);

    const loaded = getSentMessage('tenant-x', 'MSG2') as any;
    assert.ok(Buffer.isBuffer(loaded.imageMessage.mediaKey));
    assert.ok(message.imageMessage.mediaKey.equals(loaded.imageMessage.mediaKey));
});

test('missing messages return undefined', () => {
    assert.equal(getSentMessage('tenant-x', 'MISSING'), undefined);
});

test('the message store is isolated between sessions', () => {
    storeSentMessage('tenant-p', 'SAME', { conversation: 'belongs to P' });
    storeSentMessage('tenant-q', 'SAME', { conversation: 'belongs to Q' });

    assert.deepEqual(getSentMessage('tenant-p', 'SAME'), { conversation: 'belongs to P' });
    assert.deepEqual(getSentMessage('tenant-q', 'SAME'), { conversation: 'belongs to Q' });
});
