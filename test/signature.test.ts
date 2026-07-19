import test from 'node:test';
import assert from 'node:assert/strict';
import { signWebhookPayload, verifyWebhookSignature } from '../src/webhook/signature.js';
test('webhook signatures verify the exact stored body',()=>{const sig=signWebhookPayload('secret','1000','{"x":1}');assert.equal(verifyWebhookSignature('secret','1000','{"x":1}',`sha256=${sig}`),true);assert.equal(verifyWebhookSignature('secret','1000','{"x":2}',sig),false);});
