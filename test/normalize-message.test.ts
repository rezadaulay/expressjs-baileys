import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWebhookPayload, extractContent, unwrapMessage } from '../src/webhook/normalize-message.js';

test('unwraps nested messages and extracts text',()=>assert.deepEqual(extractContent({ephemeralMessage:{message:{extendedTextMessage:{text:'hello'}}}}),{message_type:'text',text:'hello'}));
test('extracts media metadata without media bytes',()=>assert.deepEqual(extractContent({imageMessage:{mimetype:'image/jpeg',fileLength:{toNumber:()=>42},width:10,height:20,caption:'photo'}}),{message_type:'image',media:{mimetype:'image/jpeg',size_bytes:42,width:10,height:20,caption:'photo'}}));
test('builds group payload with participant sender',()=>{const payload=buildWebhookPayload('sales','account@s.whatsapp.net',{key:{id:'m1',remoteJid:'group@g.us',participant:'sender@s.whatsapp.net'},messageTimestamp:{toNumber:()=>123},pushName:'Sender',message:{conversation:'hi'}},'sync');assert.equal(payload?.event_id,'sales:m1');assert.equal(payload?.data.sender_id,'sender@s.whatsapp.net');assert.equal(payload?.data.is_group,true);assert.equal(payload?.delivery_context,'sync');});
test('unknown content and malformed messages are safe',()=>{assert.deepEqual(extractContent({contactMessage:{}}),{message_type:'unknown'});assert.equal(buildWebhookPayload('x',undefined,{key:{}},'realtime'),null);assert.ok(unwrapMessage({conversation:'x'}));});
