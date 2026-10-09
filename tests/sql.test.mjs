import test from 'node:test';
import assert from 'node:assert/strict';
import {SQL} from '../src/sql.mjs';
import {ingestSnapshot,settleOutcome} from '../src/worker.mjs';
test('no SQLite-only insert syntax',()=>{for(const q of Object.values(SQL))assert.doesNotMatch(q,/INSERT\s+OR\s+(IGNORE|REPLACE)/i)});
test('snapshot records exactly once',async()=>{let claimed=false;const log=[];const db={connect:async()=>({query:async(q)=>{log.push(q);if(q===SQL.claimTick)return {rowCount:claimed?0:1};if(q===SQL.snapshot)claimed=true;return {rowCount:1};},release(){}})};const v={source:'dex',observedAt:300000,quotes:{BTC:1}};assert.equal((await ingestSnapshot(db,v)).status,'recorded');assert.equal((await ingestSnapshot(db,v)).status,'duplicate');assert.ok(log.includes('COMMIT'));});
test('settlement rejects replay',async()=>{let pending=true;const db={connect:async()=>({query:async(q)=>{if(q===SQL.settle){if(!pending)return {rowCount:0};pending=false;return {rowCount:1};}return {rowCount:0}},release(){}})};const v={signalId:'s1',horizonMinutes:240,evaluatedAt:1000000,exitPrice:100,grossBps:5,netBps:2,baselineNetBps:-8};assert.equal((await settleOutcome(db,v)).status,'settled');assert.equal((await settleOutcome(db,v)).status,'not_pending');});
