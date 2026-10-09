CREATE SCHEMA IF NOT EXISTS kisa_dex;
SET search_path TO kisa_dex, public;
CREATE TABLE IF NOT EXISTS runs(source text NOT NULL,tick bigint NOT NULL,PRIMARY KEY(source,tick));
CREATE TABLE IF NOT EXISTS snapshots(source text NOT NULL,ts bigint NOT NULL,data jsonb NOT NULL,PRIMARY KEY(source,ts));
CREATE TABLE IF NOT EXISTS state(source text PRIMARY KEY,ts bigint NOT NULL,cooldown jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS shadow_signals(signal_id text PRIMARY KEY,source text NOT NULL,asset_id text NOT NULL,symbol text NOT NULL,created_at bigint NOT NULL,direction integer NOT NULL CHECK(direction IN(-1,1)),baseline_direction integer NOT NULL CHECK(baseline_direction IN(-1,1)),entry_price double precision NOT NULL CHECK(entry_price>0),trigger_change_pct double precision NOT NULL,round_trip_cost_bps double precision NOT NULL CHECK(round_trip_cost_bps>=0),model_version text NOT NULL,baseline_model_version text NOT NULL,agent_id text NOT NULL,claim_hash text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS shadow_outcomes(signal_id text NOT NULL REFERENCES shadow_signals(signal_id),horizon_minutes integer NOT NULL CHECK(horizon_minutes IN(15,60,240)),due_at bigint NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','evaluated','missing')),evaluated_at bigint,exit_price double precision,gross_return_bps double precision,net_return_bps double precision,baseline_net_return_bps double precision,PRIMARY KEY(signal_id,horizon_minutes));
CREATE OR REPLACE FUNCTION reject_shadow_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shadow_signals immutable'; END $$;
DROP TRIGGER IF EXISTS shadow_immutable ON shadow_signals;
CREATE TRIGGER shadow_immutable BEFORE UPDATE OR DELETE ON shadow_signals FOR EACH ROW EXECUTE FUNCTION reject_shadow_mutation();
CREATE OR REPLACE FUNCTION reject_finalized_outcome_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'finalized outcome immutable'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS outcome_immutable ON shadow_outcomes;
CREATE TRIGGER outcome_immutable BEFORE UPDATE OR DELETE ON shadow_outcomes FOR EACH ROW EXECUTE FUNCTION reject_finalized_outcome_mutation();
CREATE TABLE IF NOT EXISTS dex_decisions(decision_id text PRIMARY KEY,source text NOT NULL,observed_at bigint NOT NULL,entry_price double precision NOT NULL CHECK(entry_price>0),action text NOT NULL CHECK(action='NO_TRADE'),evidence_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION reject_dex_decision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'dex decision immutable'; END $$;
DROP TRIGGER IF EXISTS dex_decision_immutable ON dex_decisions;
CREATE TRIGGER dex_decision_immutable BEFORE UPDATE OR DELETE ON dex_decisions FOR EACH ROW EXECUTE FUNCTION reject_dex_decision_mutation();

-- OWL-PROFIT-PROOF-001: independent, append-only prospective decision record.
CREATE TABLE IF NOT EXISTS proof_decisions (
 decision_id text PRIMARY KEY,
 trial_id text NOT NULL CHECK (trial_id='OWL-PROFIT-PROOF-001'),
 symbol text NOT NULL,
 observed_at timestamptz NOT NULL,
 signal_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 action text NOT NULL CHECK(action IN ('LONG','SHORT','NO_TRADE')),
 reason text NOT NULL,
 evidence_hash text NOT NULL,
 payload jsonb NOT NULL,
 CONSTRAINT freeze_before_commit CHECK (observed_at<=signal_at),
 CONSTRAINT hash_nonempty CHECK (length(evidence_hash)=64)
);
CREATE OR REPLACE FUNCTION reject_proof_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'proof_decisions immutable'; END $$;
DROP TRIGGER IF EXISTS proof_decisions_immutable ON proof_decisions;
CREATE TRIGGER proof_decisions_immutable BEFORE UPDATE OR DELETE ON proof_decisions
FOR EACH ROW EXECUTE FUNCTION reject_proof_mutation();
