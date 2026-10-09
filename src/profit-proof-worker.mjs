import {freezeProfitProof} from './profit-proof.mjs';
const get=async(url,fetcher)=>{const r=await fetcher(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'KISA-DEX/1.0'}});if(!r.ok)throw Error('HTTP_'+r.status);return r.json()};
export async function runProfitProof({db,fetcher=fetch,now=Date.now()}){
 const boundary=Math.floor(now/3600000)*3600000;
 if(now-boundary>600000)return {status:'SKIP_NOT_HOURLY_WINDOW'};
 const at=new Date(now).toISOString(), symbol='BTCUSDT';
 const [raw,okx,bitget]=await Promise.all([
  get('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600',fetcher),
  get('https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP',fetcher),
  get('https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES',fetcher)
 ]);
 if(!Array.isArray(raw)||!Array.isArray(okx.data)||!Array.isArray(bitget.data))throw Error('BAD_MARKET_RESPONSE');
 const bars=raw.filter(x=>Number(x[0])*1000+3600000<=boundary).sort((a,b)=>a[0]-b[0]).slice(-52).map(x=>({closedAt:new Date(Number(x[0])*1000+3600000).toISOString(),low:Number(x[1]),high:Number(x[2]),close:Number(x[4])}));
 const a=okx.data[0], b=bitget.data[0];
 const quotes=[{venue:'okx',price:Number(a?.last),observedAt:new Date(Number(a?.ts)).toISOString()},{venue:'bitget',price:Number(b?.lastPr),observedAt:new Date(Number(b?.ts)).toISOString()}];
 const frozen=freezeProfitProof({symbol,bars,quotes,at,modelCommit:'OWL-PROFIT-PROOF-001-v1'});
 // A rejection is informative, but never allowed to become a fake trade.
 if(!frozen.id)return {status:'REJECTED_EVIDENCE',reason:frozen.reason};
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  const result=await client.query(`INSERT INTO proof_decisions
   (decision_id,trial_id,symbol,observed_at,signal_at,action,reason,evidence_hash,payload)
   VALUES($1,$2,$3,$4::timestamptz,clock_timestamp(),$5,$6,$7,$8::jsonb)
   ON CONFLICT(decision_id) DO NOTHING
   RETURNING decision_id,signal_at,action,evidence_hash`,[frozen.id,frozen.trial,symbol,at,frozen.action,frozen.reason,frozen.evidenceHash,JSON.stringify(frozen)]);
  await client.query('COMMIT');
  const row=result.rows[0];
  return row?{status:'FROZEN',...row}:{status:'DEDUPLICATED',decisionId:frozen.id};
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}
}
