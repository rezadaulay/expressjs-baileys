import { createHash } from 'node:crypto';
import { store } from './storage.js';
export type IdempotencyCheck={action:'proceed'}|{action:'replay';responseBody:string}|{action:'in_flight'}|{action:'mismatch'};
const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
export function computeRequestHash(normalized:unknown){return createHash('sha256').update(JSON.stringify(sorted(normalized))).digest('hex');}
export function beginIdempotentRequest(sessionId:string,key:string,hash:string):IdempotencyCheck{const now=Date.now();const row=store.getIdempotentRequest(sessionId,key);if(!row)return store.insertIdempotentRequest({sessionId,idempotencyKey:key,requestHash:hash,createdAt:now})?{action:'proceed'}:{action:'in_flight'};if(row.request_hash!==hash)return {action:'mismatch'};if(row.status==='completed')return {action:'replay',responseBody:row.response_body??'{}'};if(row.status==='processing'&&now-row.created_at<=300000)return {action:'in_flight'};store.updateIdempotentRequest(sessionId,key,{status:'processing',createdAt:now});return {action:'proceed'};}
export function completeIdempotentRequest(sessionId:string,key:string,responseBody:string,messageId:string|null){store.updateIdempotentRequest(sessionId,key,{status:'completed',responseBody,...(messageId?{messageId}:{}),completedAt:Date.now()});}
export function failIdempotentRequest(sessionId:string,key:string,responseBody:string){store.updateIdempotentRequest(sessionId,key,{status:'failed',responseBody,completedAt:Date.now()});}
