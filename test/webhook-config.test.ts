import test from 'node:test';
import assert from 'node:assert/strict';
import { getWebhookConfig } from '../src/config.js';

const keys=['WA_WEBHOOK_ENABLED','WA_WEBHOOK_URL','WA_WEBHOOK_SECRET','WA_WEBHOOK_TIMEOUT_MS','WA_WEBHOOK_MAX_ATTEMPTS','WA_WEBHOOK_INCLUDE_GROUPS','WA_WEBHOOK_INCLUDE_FROM_ME','WA_WEBHOOK_PROCESS_APPEND'];
const withEnv=(values:Record<string,string|undefined>,fn:()=>void)=>{const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{for(const key of keys)delete process.env[key];for(const [key,value] of Object.entries(values))if(value!==undefined)process.env[key]=value;fn();}finally{for(const key of keys){const value=saved[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}}};
test('webhook defaults to disabled',()=>withEnv({},()=>assert.deepEqual(getWebhookConfig(),{enabled:false})));
test('enabled webhook validates URL and secret',()=>withEnv({WA_WEBHOOK_ENABLED:'true'},()=>assert.throws(getWebhookConfig,/URL is required/)));
test('webhook parses numeric and boolean settings',()=>withEnv({WA_WEBHOOK_ENABLED:'yes',WA_WEBHOOK_URL:'https://example.test/hook',WA_WEBHOOK_SECRET:'secret',WA_WEBHOOK_TIMEOUT_MS:'25',WA_WEBHOOK_MAX_ATTEMPTS:'3',WA_WEBHOOK_INCLUDE_GROUPS:'1',WA_WEBHOOK_PROCESS_APPEND:'false'},()=>assert.deepEqual(getWebhookConfig(),{enabled:true,url:'https://example.test/hook',secret:'secret',timeoutMs:25,maxAttempts:3,includeGroups:true,includeFromMe:false,processAppend:false})));
