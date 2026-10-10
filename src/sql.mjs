// PostgreSQL only. No SQLite INSERT OR IGNORE/REPLACE.
// Seven minutes covers one 5-minute polling interval plus limited transport jitter.
// Never settle a 15/60/240-minute horizon at an arbitrary later price.
export const MAX_SETTLEMENT_LAG_MS = 7 * 60 * 1000;
export const SQL = Object.freeze({
 claimTick: 'INSERT INTO runs(source,tick) VALUES ($1,$2) ON CONFLICT (source,tick) DO NOTHING RETURNING tick',
 snapshot: 'INSERT INTO snapshots(source,ts,data) VALUES ($1,$2,$3) ON CONFLICT (source,ts) DO NOTHING',
 state: 'INSERT INTO state(source,ts,cooldown) VALUES ($1,$2,$3) ON CONFLICT (source) DO UPDATE SET ts=EXCLUDED.ts,cooldown=EXCLUDED.cooldown WHERE state.ts<=EXCLUDED.ts',
 decision: 'INSERT INTO shadow_signals(signal_id,source,asset_id,symbol,created_at,direction,baseline_direction,entry_price,trigger_change_pct,round_trip_cost_bps,model_version,baseline_model_version,agent_id,claim_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (signal_id) DO NOTHING',
 pending: "INSERT INTO shadow_outcomes(signal_id,horizon_minutes,due_at,status) VALUES ($1,$2,$3,'pending') ON CONFLICT (signal_id,horizon_minutes) DO NOTHING",
 settle: `UPDATE shadow_outcomes SET status='evaluated',evaluated_at=$1,exit_price=$2,gross_return_bps=$3,net_return_bps=$4,baseline_net_return_bps=$5 WHERE signal_id=$6 AND horizon_minutes=$7 AND status='pending' AND $1 BETWEEN due_at AND due_at + ${MAX_SETTLEMENT_LAG_MS} RETURNING signal_id`,
 expire: `UPDATE shadow_outcomes o SET status='missing',evaluated_at=$1 FROM shadow_signals s WHERE o.signal_id=s.signal_id AND s.source=$2 AND o.status='pending' AND o.due_at + ${MAX_SETTLEMENT_LAG_MS} < $1 RETURNING o.signal_id,o.horizon_minutes`,
});
