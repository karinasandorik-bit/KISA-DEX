import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {cycle} from '../src/live.mjs';
const url=process.env.TEST_DATABASE_URL;
test('real PostgreSQL: market -> immutable prospective NO_TRADE and snapshot', {skip:!url}, async()=>{
 const db=new pg.Pool({connectionString:url,options:'-c search_path=kisa_dex,public'});
 try{
  await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const now=Date.now(),observedAt=now-1000,price='71234.12';
  const fetcher=async()=>({ok:true,json:async()=>({price,time:new Date(observedAt).toISOString()})});
  const a=await cycle({now,fetcher,db});
  const b=await cycle({now,fetcher,db});
  assert.equal(a.receipt.status,'recorded');
  assert.equal(b.receipt.status,'duplicate');
  const d=await db.query('SELECT action,entry_price,evidence_hash FROM dex_decisions WHERE decision_id=$1',[a.decisionId]);
  assert.equal(d.rowCount,1);assert.equal(d.rows[0].action,'NO_TRADE');
  const s=await db.query('SELECT data FROM snapshots WHERE source=$1 AND ts=$2',['coinbase:BTC-USD',observedAt]);
  assert.equal(s.rowCount,1);
  await assert.rejects(db.query('UPDATE dex_decisions SET action=$1 WHERE decision_id=$2',['NO_TRADE',a.decisionId]),/immutable/);
  await assert.rejects(db.query('DELETE FROM dex_decisions WHERE decision_id=$1',[a.decisionId]),/immutable/);
 }finally{await db.end();}
});

test('real PostgreSQL: finalized outcome immutable and cannot settle before due time',{skip:!url},async()=>{
 const db=new pg.Pool({connectionString:url,options:'-c search_path=kisa_dex,public'});
 try{
  await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  const id='integration-'+Date.now()+'-'+process.pid;
  const now=Date.now();
  await db.query('INSERT INTO shadow_signals(signal_id,source,asset_id,symbol,created_at,direction,baseline_direction,entry_price,trigger_change_pct,round_trip_cost_bps,model_version,baseline_model_version,agent_id,claim_hash) VALUES($1,$2,$3,$4,$5,1,-1,100,0,1,$6,$7,$8,$9)',[id,'coinbase:BTC-USD','BTC-USD','BTC-USD',now,'test-v1','baseline-v1','ci',id]);
  await db.query('INSERT INTO shadow_outcomes(signal_id,horizon_minutes,due_at,status) VALUES($1,15,$2,$3)',[id,now+900000,'pending']);
  const {settleOutcome}=await import('../src/worker.mjs');
  const params={signalId:id,horizonMinutes:15,evaluatedAt:now,exitPrice:101,grossBps:100,netBps:99,baselineNetBps:-101};
  assert.equal((await settleOutcome(db,params)).status,'not_pending');
  assert.equal((await settleOutcome(db,{...params,evaluatedAt:now+900000})).status,'settled');
  assert.equal((await settleOutcome(db,{...params,evaluatedAt:now+900001})).status,'not_pending');
  await assert.rejects(db.query('UPDATE shadow_outcomes SET exit_price=999 WHERE signal_id=$1',[id]),/immutable/);
  await assert.rejects(db.query('DELETE FROM shadow_signals WHERE signal_id=$1',[id]),/immutable/);
 }finally{await db.end();}
});
