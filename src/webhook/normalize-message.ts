import type { WebhookPayload, MessageType, MediaMetadata } from './types.js';

export interface ResolvedSenderIdentity {
    pnJid?: string;
    phone?: string;
}

export const toNumber = (value: any): number => typeof value === 'object' && value?.toNumber ? value.toNumber() : Number(value);

export function unwrapMessage(input:any):any {
    let message=input;
    for(let i=0;i<5;i++){
        const next=message?.ephemeralMessage?.message ?? message?.viewOnceMessage?.message ?? message?.viewOnceMessageV2?.message ?? message?.viewOnceMessageV2Extension?.message ?? message?.documentWithCaptionMessage?.message ?? message?.editedMessage?.message ?? message?.protocolMessage?.editedMessage;
        if(!next)break; message=next;
    }
    return message;
}

export function extractContent(input:any):{message_type:MessageType;text?:string;media?:MediaMetadata}{
    const msg=unwrapMessage(input);
    if(typeof msg?.conversation==='string')return {message_type:'text',text:msg.conversation};
    if(typeof msg?.extendedTextMessage?.text==='string')return {message_type:'text',text:msg.extendedTextMessage.text};
    const map:[string,MessageType][]=[['imageMessage','image'],['videoMessage','video'],['audioMessage','audio'],['documentMessage','document'],['stickerMessage','sticker']];
    for(const [key,type] of map){const m=msg?.[key];if(!m)continue;const media:MediaMetadata={};if(m.mimetype)media.mimetype=m.mimetype;if(m.fileLength!=null)media.size_bytes=toNumber(m.fileLength);if(m.fileName)media.file_name=m.fileName;if(m.width!=null)media.width=toNumber(m.width);if(m.height!=null)media.height=toNumber(m.height);if(m.seconds!=null)media.duration_seconds=toNumber(m.seconds);if(m.caption)media.caption=m.caption;return {message_type:type,media};}
    return {message_type:'unknown'};
}

export function phoneFromPnJid(pnJid:string|undefined):string|undefined{
    const user=pnJid?.split('@')[0]?.split(':')[0];
    return user && /^\d+$/.test(user) ? user : undefined;
}

export function buildWebhookPayload(sessionId:string,accountJid:string|undefined,msg:any,deliveryContext:'realtime'|'sync',resolvedSender?:ResolvedSenderIdentity):WebhookPayload|null{
    if(!msg?.message||!msg?.key?.id||!msg?.key?.remoteJid)return null;
    const timestamp=toNumber(msg.messageTimestamp);if(!Number.isFinite(timestamp))return null;
    const isGroup=msg.key.remoteJid.endsWith('@g.us');
    const content=extractContent(msg.message);
    const senderId=isGroup?(msg.key.participant??msg.key.remoteJid):msg.key.remoteJid;
    const pnJid=resolvedSender?.pnJid;
    const phone=resolvedSender?.phone ?? phoneFromPnJid(pnJid);
    return {version:'1.0',event:'whatsapp.message.received',event_id:`${sessionId}:${msg.key.id}`,session:sessionId,occurred_at:new Date(timestamp*1000).toISOString(),delivery_context:deliveryContext,account:{jid:accountJid??''},data:{message_id:msg.key.id,chat_id:msg.key.remoteJid,sender_id:senderId,...(pnJid?{sender_pn_jid:pnJid}:{}),...(phone?{sender_phone:phone}:{}),...(msg.pushName?{sender_name:msg.pushName}:{}),from_me:Boolean(msg.key.fromMe),is_group:isGroup,...content,timestamp}};
}
