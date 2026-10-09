import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ingestSnapshot,settleOutcome} from './worker.mjs';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSLMODE==='disable'?false:{rejectUnauthorized:false}});
const url='https://api.exchange.coinbase.com/products/BTC-USD/ticker';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function cycle({now=Date.now(),fetcher=fetch,db=pool}={}){
 const response=await fetcher(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'KISA-DEX/1.0'}});
 if(!response.ok)throw Error('market_http_'+response.status);
 const quote=await response.json(),price=Number(quote.price);
 const observedAt=Date.parse(quote.time);
 if(!(price>0)||!Number.isSafeInteger(observedAt)||observedAt>now+60000||now-observedAt>300000)throw Error('stale_or_invalid_quote');
 const source='coinbase:BTC-USD',assetId='BTC-USD';
 const receipt=await ingestSnapshot(db,{source,observedAt,quotes:{[assetId]:{price,source,observedAt}}});
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  const pending=await client.query("SELECT o.signal_id,o.horizon_minutes,o.due_at,s.entry_price,s.direction,s.baseline_direction,s.round_trip_cost_bps FROM shadow_outcomes o JOIN shadow_signals s USING(signal_id) WHERE s.source=$1 AND o.status='pending' AND o.due_at<=$2 FOR UPDATE OF o",[source,observedAt]);
  await client.query('COMMIT');
  for(const row of pending.rows){
   const raw=(price/row.entry_price-1)*10000,cost=row.round_trip_cost_bps;
   await settleOutcome(db,{signalId:row.signal_id,horizonMinutes:row.horizon_minutes,evaluatedAt:observedAt,exitPrice:price,grossBps:row.direction*raw,netBps:row.direction*raw-cost,baselineNetBps:row.baseline_direction*raw-cost});
  }
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
 // No directional trade is invented from a single ticker; NO_TRADE is the prospective decision.
 const decisionId=sha({source,observedAt,model:'no-trade-baseline-v1'});
 const decision=await db.query('INSERT INTO dex_decisions(decision_id,source,observed_at,entry_price,action,evidence_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(decision_id) DO NOTHING RETURNING decision_id',[decisionId,source,observedAt,price,'NO_TRADE',sha({source,observedAt,price})]);
 console.log(JSON.stringify({event:'DEX_CYCLE_OK',source,observedAt,receipt,settlements:pending.rows.length,decisionId,decisionWritten:decision.rowCount===1,mode:'SHADOW_ONLY'}));
 return {receipt,decisionId,settlements:pending.rows.length};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{await pool.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));await cycle();await pool.end();}catch(e){console.error(JSON.stringify({event:'DEX_CYCLE_FAILED',reason:e.message}));await pool.end();process.exitCode=1;}
}
