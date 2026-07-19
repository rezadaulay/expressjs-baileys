import { createHmac, timingSafeEqual } from 'node:crypto';
export function signWebhookPayload(secret:string,timestamp:string,rawBody:string){return createHmac('sha256',secret).update(`${timestamp}.${rawBody}`).digest('hex');}
export function verifyWebhookSignature(secret:string,timestamp:string,rawBody:string,signature:string){const expected=Buffer.from(signWebhookPayload(secret,timestamp,rawBody),'hex');const supplied=Buffer.from(signature.replace(/^sha256=/,''),'hex');return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}
