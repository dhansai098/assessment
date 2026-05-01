# Sentinel IMS — Mission-Critical Incident Management System

> Engineering challenge submission. A resilient incident management system for monitoring distributed stacks (APIs, MCP Hosts, Caches, Queues, RDBMS, NoSQL) with debounced signal ingestion, workflow-driven incident lifecycle, and mandatory Root Cause Analysis (RCA).

---

## 1. Architecture

```
                         ┌─────────────────────────────────────┐
   Producers ─POST/WS──▶ │  Ingestion API (Fastify + Zod)      │
  (services emitting     │   • Token-bucket rate limiter       │
   signals @ 10k/sec)    │   • Bounded queue (backpressure)    │
                         │   • Returns 202 immediately         │
                         └────────────────┬────────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────────┐
                         │  In-Memory Worker Pool (async)      │
                         │   • Debouncer: 100 sigs / 10s ⇒ 1 WI│
                         │   • Strategy: alert routing         │
                         │   • State Machine: WI lifecycle     │
                         └──┬──────────────┬──────────────┬────┘
                            │              │              │
              ┌─────────────▼──┐  ┌────────▼────────┐  ┌──▼────────────┐
              │ MongoDB        │  │ PostgreSQL      │  │ Redis         │
              │ (Data Lake –   │  │ (Source of      │  │ (Hot-Path     │
              │  raw signals)  │  │  Truth – WI/RCA │  │  Dashboard    │
              │                │  │  transactional) │  │  State)       │
              └────────────────┘  └─────────────────┘  └───────────────┘
                                          │
                                          ▼
                                  ┌──────────────────┐
                                  │ InfluxDB         │
                                  │ (Timeseries      │
                                  │  aggregations)   │
                                  └──────────────────┘
                                          │
                            ┌─────────────▼─────────────┐
                            │  React Dashboard (Vite)   │
                            │   • Live feed (sev-sorted)│
                            │   • Detail + raw signals  │
                            │   • RCA form              │
                            └───────────────────────────┘
```

### Data separation (rubric — Data Handling 20%)

| Sink              | Purpose                                          | Why                                              |
| ----------------- | ------------------------------------------------ | ------------------------------------------------ |
| **MongoDB**       | Raw signal payloads (audit log / data lake)     | Schemaless, high write throughput, cheap queries |
| **PostgreSQL**    | Work Items + RCA records (source of truth)       | ACID transactions for state transitions          |
| **Redis**         | Real-time dashboard state, debounce counters     | <1ms hot-path reads, atomic INCR for debouncing  |
| **InfluxDB**      | Signals/sec timeseries per component             | Optimised for rollups & retention policies       |

---

## 2. Quickstart

```bash
docker compose up --build
```

- Backend API → http://localhost:8080
- Health     → http://localhost:8080/health
- Metrics    → http://localhost:8080/metrics
- Frontend   → http://localhost:5173

Trigger a simulated multi-stack failure:

```bash
node scripts/simulate-failure.js
```

---

## 3. Backpressure Strategy

The system handles bursts up to **10,000 signals/sec**. Four mechanisms cooperate:

1. **Bounded ingestion queue** (`backend/src/ingestion/queue.ts`) — `BoundedAsyncQueue<Signal>` with `maxSize = 50_000`. When full, the API returns **`429 Too Many Requests`** instead of OOM-ing.
2. **Token-bucket rate limiter** (`backend/src/ingestion/rate-limiter.ts`) — per-IP cap of `1000 req/sec` (configurable). Prevents a single noisy producer from monopolising the queue.
3. **Async worker pool** drains the queue in batches of 500 and writes to MongoDB. The persistence-layer latency is decoupled from the API's response time — the API never waits on Mongo / Postgres.
4. **Retry with exponential backoff** (`backend/src/storage/retry.ts`) — DB writes retry up to 5 times (100ms → 1.6s). After exhaustion, the signal is moved to a `dead-letter` Mongo collection so nothing is ever silently dropped.

Result: the API stays responsive and the system **degrades gracefully** rather than crashing when downstream sinks are slow.

---

## 4. Design Patterns

| Concern               | Pattern         | File                                              |
| --------------------- | --------------- | ------------------------------------------------- |
| Alerting per severity | **Strategy**    | `backend/src/patterns/alert-strategy.ts`          |
| Work Item lifecycle   | **State**       | `backend/src/patterns/state-machine.ts`           |
| Debouncing            | **Sliding window** | `backend/src/workflow/debouncer.ts`            |
| Storage retries       | **Decorator**   | `backend/src/storage/retry.ts`                    |

### State Machine

```
  OPEN ──▶ INVESTIGATING ──▶ RESOLVED ──▶ CLOSED
                                          ▲
                                          │ (only if RCA exists)
```

Closing without a complete RCA throws `RcaRequiredError` — verified by unit tests.

### Alerting Strategy

Component type → strategy:

- `RDBMS` → `PagerDutyP0Strategy` (page on-call immediately)
- `CACHE` → `SlackP2Strategy` (notify channel)
- `MCP_HOST` → `PagerDutyP1Strategy`
- ...

Adding a new alert channel = add a new strategy class. Zero changes to the workflow engine.

---

## 5. Functional Requirements Map

| Spec requirement                                  | Implementation                                                  |
| ------------------------------------------------- | --------------------------------------------------------------- |
| Async processing                                  | Worker pool draining bounded queue                              |
| Mandatory RCA before CLOSED                       | `validateClose()` + DB trigger as defence-in-depth              |
| MTTR auto-calc                                    | `(rca.incident_end - work_item.start_time)` on close            |
| Debounce (100 signals / 10s ⇒ 1 WI)               | Redis sliding window keyed by `component_id`                    |
| Rate limiting on ingestion                        | Token bucket, per-IP                                            |
| `/health` endpoint                                | Returns 200 + dependency check (mongo/pg/redis ping)            |
| Throughput metrics every 5s                       | `setInterval` prints `[IMS] Throughput: X.XX sig/s` to console  |

---

## 6. Testing

```bash
cd backend && npm test
```

Covers:

- RCA validation (cannot close without RCA, cannot close with incomplete RCA)
- State machine transition guard (cannot skip states)
- Debouncer (101 signals in 10s ⇒ exactly 1 work item, 101 signals linked)
- Retry logic (3 transient failures ⇒ eventual success; 6 failures ⇒ DLQ)

---

## 7. Repository Layout

```
.
├── backend/                     Node 20 + TypeScript + Fastify
│   ├── src/
│   │   ├── ingestion/           Queue, rate limiter, HTTP endpoint
│   │   ├── workflow/            Debouncer, MTTR, RCA validator
│   │   ├── patterns/            Strategy + State Machine
│   │   ├── storage/             Postgres / Mongo / Redis / Influx clients
│   │   └── api/                 REST handlers (work_items, rcas, signals)
│   ├── tests/
│   ├── Dockerfile
│   └── package.json
├── frontend/                    React 19 + Vite + Tailwind
│   └── src/
├── scripts/
│   └── simulate-failure.js      Multi-stack outage scenario
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DESIGN_DECISIONS.md
│   └── PROMPTS.md               All AI prompts used to build this
├── docker-compose.yml
└── README.md
```

---

## 8. Sample Failure Scenario

`scripts/simulate-failure.js` reproduces a real cascade:

1. **T+0s** — RDBMS_PRIMARY emits 50 connection-pool-exhausted errors
2. **T+2s** — CACHE_CLUSTER_01 emits 200 cache-miss-stampede signals (caused by #1)
3. **T+5s** — MCP_HOST_01 emits 80 timeout signals (caused by #2)
4. **T+12s** — second wave on CACHE_CLUSTER_01 (now in a NEW work item — debounce window closed)

Expected outcome in dashboard: **3 distinct active incidents**, sorted P0 → P1 → P2, with hundreds of raw signals each.

---

## 9. Bonus Additions

- 🎯 **Realtime UI updates** via WebSocket / Postgres LISTEN_NOTIFY (no polling)
- 📊 **Per-component MTTR breakdown** in the dashboard footer
- 🛡 **Circuit breaker** in the Mongo client to fast-fail when downstream is unhealthy
- 🐳 **Single-command spin-up** with healthchecks across all 4 datastores
