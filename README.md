# KISA-DEX — owned shadow-only market worker
Owner: karinasandorik-bit. No dependencies on deontey303.
- `npm test` tests SQL syntax, idempotent snapshots and settlement replay behavior.
- `DATABASE_URL=... npm start` applies idempotent schema and reads live Coinbase BTC-USD ticker.
- One prospective NO_TRADE decision per observed quote, no fabricated LONG/SHORT edge.
- Settles eligible prior shadow outcomes with a later market observation. **A ticker-only settlement is not a complete 4h OHLC path or execution fill.**
- No order execution, exchange API keys, wallet signing or broadcasts.
- Postgres triggers prohibit changes to finalized outcomes and shadow signals.
- Required acceptance: observe DEX_CYCLE_OK, read back dex_decisions and snapshots, verify immutability with rollback-only SQL test.
