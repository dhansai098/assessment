# Design Decisions

## Trade-offs

### Why a bounded queue instead of just relying on Postgres backpressure?
Postgres connection-pool exhaustion would surface as 5xx errors *to the
producer*, which then retries — amplifying the storm. The bounded queue + 429
gives producers a clean signal "I'm busy, slow down" that retry libraries
respect (Retry-After header).

### Why SETNX-based debouncing instead of an in-memory map?
Multiple backend replicas. An in-memory map per replica would create N work
items per component instead of 1. Redis is the natural shared-state primitive.

### Why a DB trigger for close-without-RCA validation when the state machine
### already enforces it?
Defence-in-depth. Future engineers might add a new code path
(e.g. a batch-close admin script) that bypasses the workflow engine. The
trigger guarantees the invariant regardless of caller.

### Why no Kafka?
Spec says "high throughput" but production deployment is out of scope. The
bounded async queue + worker pool is functionally equivalent for the demo and
trivially swappable for Kafka (`producer.send` instead of `queue.tryEnqueue`,
`consumer.subscribe` instead of `queue.dequeueBatch`). The interfaces are
intentionally compatible.

## Things that would change at real production scale

- Replace the in-process queue with Kafka (durability + replay)
- Add a pre-aggregation Flink job for the per-component throughput windows
- Switch Postgres to logical replication into a read-replica for the dashboard
- Add OpenTelemetry tracing through the worker pool (currently only logs)
