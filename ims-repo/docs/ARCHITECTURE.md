# Architecture

See README.md for the data-flow diagram.

## Why each datastore

**MongoDB — Data Lake**
The raw signal volume is the largest by 2-3 orders of magnitude. Mongo gives us
schemaless writes (signals from different components have different payload
shapes), high write throughput, and cheap queries by `work_item_id` index. We
store nothing here that requires transactions.

**PostgreSQL — Source of Truth**
Work Items and RCAs need ACID transitions: closing an incident must atomically
verify the RCA exists, write the close timestamp, and compute MTTR. Postgres
triggers act as a defence-in-depth layer — even a buggy service that bypasses
the workflow engine cannot create an incomplete state.

**Redis — Hot Path + Debouncer**
Two hats:
1. The dashboard reads "active incidents count" from Redis (`work_items:active`)
   instead of hitting Postgres on every refresh.
2. The debouncer uses Redis `SET ... EX 10 NX` as the per-component sliding
   window. SETNX gives us a race-safe "create-once" primitive without a
   distributed lock manager.

**InfluxDB — Timeseries Aggregations**
Postgres can store timeseries, but Influx beats it on rollups, downsampling, and
retention policies. We write a 1-tick `signal{component=...}` point per ingest
and let Influx aggregate to any granularity Grafana asks for.

## Why Fastify + Node

- v8's async event loop comfortably handles 10k req/sec with HTTP/1.1 keep-alive
- Fastify schema validation (Zod) is faster than Express middleware chains
- Single language end-to-end (frontend is also TS) reduces context switching
