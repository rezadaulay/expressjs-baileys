import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { store } from '../src/storage.js';
import { startWebhookDispatcher } from '../src/webhook/dispatcher.js';
import { verifyWebhookSignature } from '../src/webhook/signature.js';

const waitFor=async(fn:()=>boolean)=>{const end=Date.now()+1000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('timed out');};
test('dispatcher sends stored body with a valid signature and marks delivered',async()=>{const id=randomUUID(),body='{"event":"whatsapp.message.received"}';store.insertOutboxEvent({id,sessionId:'dispatch',messageId:id,eventType:'whatsapp.message.received',payload:body,nextAttemptAt:Date.now(),createdAt:Date.now()});let calls=0;const dispatcher=startWebhookDispatcher({enabled:true,url:'https://receiver.test/hook',secret:'secret',timeoutMs:100,maxAttempts:2,includeGroups:false,includeFromMe:false,processAppend:true},{pollIntervalMs:10,fetchImpl:async(_url,init)=>{calls++;const headers=new Headers(init?.headers);assert.equal(init?.body,body);assert.equal(verifyWebhookSignature('secret',headers.get('X-WA-Timestamp')!,body,headers.get('X-WA-Signature')!),true);return new Response('ok',{status:200});}});try{await waitFor(()=>calls===1);await waitFor(()=>store.claimDueOutboxEvents(Date.now(),10).every(row=>row.id!==id));}finally{dispatcher.stop();}assert.equal(calls,1);});
