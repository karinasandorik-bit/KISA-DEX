import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sma=(a,n)=>a.slice(-n).reduce((s,x)=>s+x,0)/n;
function atr(bars,n=14){const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));return sma(tr,n)}
export function freezeProfitProof({symbol,bars,quotes,at,modelCommit,previousSignalAt=null}){
 const base={trial:'OWL-PROFIT-PROOF-001',symbol,at,modelCommit,mode:'SHADOW_ONLY',executable:false};
 const deny=reason=>({...base,action:'NO_TRADE',reason});
 if(!['BTCUSDT','ETHUSDT'].includes(symbol))return deny('SYMBOL_NOT_ALLOWED');
 const now=Date.parse(at);
 if(!Number.isFinite(now)||now%3600000!==0)return deny('NOT_HOURLY_BOUNDARY');
 if(!Array.isArray(bars)||bars.length<52)return deny('INSUFFICIENT_CANDLES');
 if(!Array.isArray(quotes)||quotes.length<2)return deny('INSUFFICIENT_VENUES');
 if(previousSignalAt!==null&&now-Date.parse(previousSignalAt)<14400000)return deny('COOLDOWN_4H');
 const venues=new Set();
 for(const q of quotes){const age=now-Date.parse(q.observedAt);if(!q.venue||venues.has(q.venue)||!Number.isFinite(q.price)||q.price<=0||!(age>=0&&age<=30000))return deny('INVALID_OR_STALE_QUOTE');venues.add(q.venue)}
 const ps=quotes.map(q=>q.price),mid=ps.reduce((a,b)=>a+b,0)/ps.length;
 if((Math.max(...ps)-Math.min(...ps))/mid*10000>20)return deny('VENUE_DIVERGENCE');
 for(let i=0;i<bars.length;i++){const b=bars[i];if(!Number.isFinite(b.close)||!Number.isFinite(b.high)||!Number.isFinite(b.low)||b.close<=0||b.high<b.low||b.high<b.close||b.low>b.close||!Number.isFinite(Date.parse(b.closedAt)))return deny('BAD_CANDLE');if(Date.parse(b.closedAt)!==now-(bars.length-i-1)*3600000)return deny('CANDLE_GAP_OR_FUTURE')}
 const close=bars.map(x=>x.close),prev=close.slice(0,-1);
 const m20=sma(close,20),m50=sma(close,50),p20=sma(prev,20),p50=sma(prev,50);
 const high=Math.max(...bars.slice(-21,-1).map(x=>x.high)),low=Math.min(...bars.slice(-21,-1).map(x=>x.low));
 const long=p20<=p50&&m20>m50&&close.at(-1)>high,short=p20>=p50&&m20<m50&&close.at(-1)<low;
 const action=long?'LONG':short?'SHORT':'NO_TRADE';
 const evidence={symbol,at,bars:bars.slice(-52),quotes,modelCommit};
 const evidenceHash=sha(evidence),id=sha({trial:base.trial,symbol,at,modelCommit});
 if(action==='NO_TRADE')return {...base,id,action,reason:'RULE_NO_SIGNAL',evidenceHash};
 const width=atr(bars,14)*1.5;if(!(width>0))return deny('INVALID_ATR');
 return {...base,id,action,reason:'FROZEN_SIGNAL',evidenceHash,entryPolicy:'NEXT_EXECUTABLE_QUOTE_AFTER_SIGNAL',referenceMid:mid,stopDistance:width,takeDistance:width*2,horizonHours:4,roundTripCostFloorBps:16,requiresActualFunding:true,riskFraction:0.0025};
}