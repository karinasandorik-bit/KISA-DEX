import {SQL} from './sql.mjs';
// Shadow-only, deliberately no exchange execution and no signer.
export async function ingestSnapshot(db, {source,observedAt,quotes}) {
 if(!source || !Number.isSafeInteger(observedAt) || !quotes || typeof quotes!=='object' || !Object.keys(quotes).length) throw new Error('invalid_market_evidence');
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  const tick=Math.floor(observedAt/300000);
  const claim=await client.query(SQL.claimTick,[source,tick]);
  if(!claim.rowCount){await client.query('ROLLBACK');return {status:'duplicate',tick};}
  await client.query(SQL.snapshot,[source,observedAt,JSON.stringify(quotes)]);
  await client.query('COMMIT');
  return {status:'recorded',source,tick,observedAt,quoteCount:Object.keys(quotes).length};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
export async function settleOutcome(db,{signalId,horizonMinutes,evaluatedAt,exitPrice,grossBps,netBps,baselineNetBps}){
 if(!signalId||![15,60,240].includes(horizonMinutes)||!Number.isSafeInteger(evaluatedAt)||![exitPrice,grossBps,netBps,baselineNetBps].every(Number.isFinite)||exitPrice<=0)throw new Error('invalid_outcome');
 const client=await db.connect();
 try{await client.query('BEGIN');
  const r=await client.query(SQL.settle,[evaluatedAt,exitPrice,grossBps,netBps,baselineNetBps,signalId,horizonMinutes]);
  if(r.rowCount!==1){await client.query('ROLLBACK');return {status:'not_pending'};}
  await client.query('COMMIT');return {status:'settled',signalId,horizonMinutes};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
