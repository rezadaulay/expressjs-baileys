import { BufferJSON } from 'baileys';
import { randomUUID } from 'node:crypto';
import { getWebhookConfig } from '../config.js';
import { store } from '../storage.js';
import { buildWebhookPayload, phoneFromPnJid, toNumber, type ResolvedSenderIdentity } from './normalize-message.js';
import type { WebhookPayload } from './types.js';

const config=getWebhookConfig();
let enabledAt:number|undefined;
export function ensureWebhookEnabledAt():number{if(enabledAt!==undefined)return enabledAt;const saved=store.getMeta('webhook_enabled_at');enabledAt=saved?Number(saved):Date.now();if(!saved)store.setMeta('webhook_enabled_at',String(enabledAt));return enabledAt;}
export function enqueueIncomingMessage(sessionId:string,messageId:string,payload:WebhookPayload){const now=Date.now();return store.insertOutboxEvent({id:randomUUID(),sessionId,messageId,eventType:payload.event,payload:JSON.stringify(payload),nextAttemptAt:now,createdAt:now});}
function readAuthJson(sessionId:string,key:string):any{
    const value=store.getAuth(sessionId,key);
    return value ? JSON.parse(value,BufferJSON.reviver) : undefined;
}
export function resolveLidSenderIdentity(sessionId:string,jid:string|undefined):ResolvedSenderIdentity|undefined{
    if(!jid?.endsWith('@lid'))return undefined;
    const lidUser=jid.split('@')[0]?.split(':')[0];
    if(!lidUser)return undefined;
    const pnUser=readAuthJson(sessionId,`lid-mapping-${lidUser}_reverse`);
    if(!pnUser)return undefined;
    const device=jid.split('@')[0]?.split(':')[1];
    const pnJid=`${pnUser}${device?`:${device}`:''}@s.whatsapp.net`;
    return {pnJid,phone:phoneFromPnJid(pnJid)};
}
export function handleMessagesUpsert(sessionId:string,accountJid:string|undefined,upsert:{messages:any[];type:string}):void{
    if(!config.enabled)return;const cutoff=ensureWebhookEnabledAt();
    for(const message of upsert.messages){try{const key=message?.key;if(!message?.message||!key?.id||!key?.remoteJid)continue;if(key.fromMe&&!config.includeFromMe)continue;if(key.remoteJid==='status@broadcast')continue;if(key.remoteJid.endsWith('@g.us')&&!config.includeGroups)continue;if(upsert.type==='append'&&(!config.processAppend||toNumber(message.messageTimestamp)*1000<cutoff))continue;const senderId=key.remoteJid.endsWith('@g.us')?key.participant:key.remoteJid;const payload=buildWebhookPayload(sessionId,accountJid,message,upsert.type==='notify'?'realtime':'sync',resolveLidSenderIdentity(sessionId,senderId));if(payload)enqueueIncomingMessage(sessionId,key.id,payload);}catch(error){console.error(`[${sessionId}] Failed to capture incoming message:`,error);}}
}
