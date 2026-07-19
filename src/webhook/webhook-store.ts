import { randomUUID } from 'node:crypto';
import { getWebhookConfig } from '../config.js';
import { store } from '../storage.js';
import { buildWebhookPayload, toNumber } from './normalize-message.js';
import type { WebhookPayload } from './types.js';

const config=getWebhookConfig();
let enabledAt:number|undefined;
export function ensureWebhookEnabledAt():number{if(enabledAt!==undefined)return enabledAt;const saved=store.getMeta('webhook_enabled_at');enabledAt=saved?Number(saved):Date.now();if(!saved)store.setMeta('webhook_enabled_at',String(enabledAt));return enabledAt;}
export function enqueueIncomingMessage(sessionId:string,messageId:string,payload:WebhookPayload){const now=Date.now();return store.insertOutboxEvent({id:randomUUID(),sessionId,messageId,eventType:payload.event,payload:JSON.stringify(payload),nextAttemptAt:now,createdAt:now});}
export function handleMessagesUpsert(sessionId:string,accountJid:string|undefined,upsert:{messages:any[];type:string}):void{
    if(!config.enabled)return;const cutoff=ensureWebhookEnabledAt();
    for(const message of upsert.messages){try{const key=message?.key;if(!message?.message||!key?.id||!key?.remoteJid)continue;if(key.fromMe&&!config.includeFromMe)continue;if(key.remoteJid==='status@broadcast')continue;if(key.remoteJid.endsWith('@g.us')&&!config.includeGroups)continue;if(upsert.type==='append'&&(!config.processAppend||toNumber(message.messageTimestamp)*1000<cutoff))continue;const payload=buildWebhookPayload(sessionId,accountJid,message,upsert.type==='notify'?'realtime':'sync');if(payload)enqueueIncomingMessage(sessionId,key.id,payload);}catch(error){console.error(`[${sessionId}] Failed to capture incoming message:`,error);}}
}
