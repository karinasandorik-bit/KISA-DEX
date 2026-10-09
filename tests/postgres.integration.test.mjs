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
