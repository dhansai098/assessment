# Build Prompts

This file captures the prompts used to scaffold the repository (per the
submission guideline #4: "All markdowns and prompts used to create this
repository should be checked in").

## Initial planning prompt
> Build a resilient Incident Management System per the attached spec
> (Engineering_Assignment_Incident_Management_System.pdf). Architecture must
> include: high-throughput signal ingestion with debouncing, a workflow engine
> using Strategy + State patterns, separate storage for raw signals (NoSQL),
> source of truth (RDBMS), hot-path cache, and timeseries aggregations.
> Include `/health`, throughput metrics every 5s, rate limiting, retries,
> and a React dashboard with Live Feed, Incident Detail, and RCA Form.

## Backend scaffolding prompt
> Generate a TypeScript Fastify backend with these modules:
> - ingestion/queue.ts — bounded async queue with backpressure (429 when full)
> - ingestion/rate-limiter.ts — token bucket per IP
> - workflow/debouncer.ts — Redis SETNX sliding window, 10s, per component
> - workflow/worker.ts — drains queue in batches of 500, 3 workers
> - patterns/state-machine.ts — OPEN→INVESTIGATING→RESOLVED→CLOSED with RCA guard
> - patterns/alert-strategy.ts — Strategy pattern dispatching by severity
> - storage/{postgres,mongo,redis,influx}.ts — connection setup
> - storage/retry.ts — exponential backoff decorator
> - api/{work-items,rcas}.ts — REST handlers
> Plus Vitest unit tests for the state machine.

## Frontend prompt
> Build a React 19 + Vite dashboard:
> - Severity-sorted live feed (P0 first), realtime updates via Postgres LISTEN
> - Click an incident → detail panel with raw signals (Mongo) + RCA form
> - RCA form submits, then user can close the incident
> - Dark ops-console aesthetic (PagerDuty/Datadog inspired), semantic tokens only
> - Signal simulator panel for triggering bursts to test debouncing

## Documentation prompt
> Write README.md, ARCHITECTURE.md, DESIGN_DECISIONS.md. The README must include
> an architecture diagram (ASCII), Docker Compose quickstart, and an explicit
> "Backpressure" section describing the bounded queue, rate limiter, async
> worker pool, and retry+DLQ strategy.
