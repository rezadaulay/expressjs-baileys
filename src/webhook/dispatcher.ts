import type { WebhookConfig } from '../config.js';
import { store, type OutboxEventRow } from '../storage.js';
import { signWebhookPayload } from './signature.js';

export interface DispatcherOptions {pollIntervalMs?:number;batchSize?:number;backoffScheduleMs?:number[];retentionMs?:number;fetchImpl?:typeof fetch}
const PERMANENT=new Set([400,401,403,404,405,410,422]);
const RETRYABLE=new Set([408,425,429]);
export function startWebhookDispatcher(config:Extract<WebhookConfig,{enabled:true}>,opts:DispatcherOptions={}){
    const poll=opts.pollIntervalMs??1000,batchSize=opts.batchSize??10,backoff=opts.backoffScheduleMs??[0,5000,15000,60000,300000,900000,3600000,21600000],retention=opts.retentionMs??604800000,fetchImpl=opts.fetchImpl??fetch;
    let stopped=false,timer:NodeJS.Timeout|undefined,lastPrune=0;
    store.resetProcessingOutboxEvents();
    const prune=(now:number)=>{if(now-lastPrune>=3600000){store.deleteExpiredOutboxEvents(now-retention);store.deleteExpiredIdempotentRequests(now-retention);lastPrune=now;}};
    prune(Date.now());
    const errorText=async(res:Response)=>`HTTP ${res.status}: ${(await res.text()).slice(0,500)}`;
    const retryAfter=(res:Response)=>{const raw=res.headers.get('retry-after');if(!raw)return 0;const seconds=Number(raw);if(Number.isFinite(seconds))return seconds*1000;const date=Date.parse(raw);return Number.isFinite(date)?Math.max(0,date-Date.now()):0;};
    const deliver=async(row:OutboxEventRow)=>{const attempts=row.attempts+1;let error='';let response:Response|undefined;try{const timestamp=String(Date.now());response=await fetchImpl(config.url,{method:'POST',body:row.payload,signal:AbortSignal.timeout(config.timeoutMs),headers:{'Content-Type':'application/json','X-WA-Event':row.event_type,'X-WA-Event-ID':`${row.session_id}:${row.message_id}`,'X-WA-Timestamp':timestamp,'X-WA-Signature':`sha256=${signWebhookPayload(config.secret,timestamp,row.payload)}`,'User-Agent':'whatsapp-server-webhook/1.0'}});if(response.ok){store.markOutboxDelivered(row.id,attempts,Date.now());console.log(`[webhook] delivered ${row.id} (attempt ${attempts})`);return;}error=await errorText(response);if(PERMANENT.has(response.status)){store.markOutboxFailed(row.id,attempts,error);console.error(`[webhook] permanently failed ${row.id}: ${error}`);return;}if(!RETRYABLE.has(response.status)&&response.status<500){store.markOutboxFailed(row.id,attempts,error);return;}}catch(e){error=e instanceof Error?e.message:String(e);}
        if(attempts>=config.maxAttempts){store.markOutboxFailed(row.id,attempts,error);console.error(`[webhook] exhausted retries ${row.id}: ${error}`);return;}
        const base=backoff[Math.min(row.attempts,backoff.length-1)]??0;let delay=Math.round(base*(0.8+Math.random()*0.4));if(response?.status===429)delay=Math.min(21600000,Math.max(delay,retryAfter(response)));store.markOutboxRetry(row.id,attempts,Date.now()+delay,error);
    };
    const tick=async()=>{if(stopped)return;const now=Date.now();prune(now);const rows=store.claimDueOutboxEvents(now,batchSize);for(const row of rows){if(stopped)break;await deliver(row);}if(!stopped)timer=setTimeout(tick,rows.length===batchSize?50:poll);};
    timer=setTimeout(tick,0);
    return {stop(){stopped=true;if(timer)clearTimeout(timer);}};
}
