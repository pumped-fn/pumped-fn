# Service Health Monitor

## Problem Statement

Build a service health monitor that tracks availability, stores check history, opens and resolves incidents, records observability data, and shuts down cleanly.

## Scope Delta From Original REQ

| Original | Capstone | Reason |
|---|---|---|
| SQLite datastore | `StorePort` interface plus in-memory driver atom | Deterministic and preset-swappable; persistence is orthogonal to the lite patterns. |
| "Pod" per request | `ExecutionContext` per API call or scheduled check | The current lite boundary is the execution context. |
| HTTP endpoints | `createApp` methods call boundary flows where the operation is command/query logic; watch-derived aggregate reads use `activeIncidentCount` | Transport is out of scope, but app methods must not bypass store logic directly. |
| Plugin hooks | `Lite.Extension` for alerting and observability | Uses the actual extension API. |
| 1000+ services perf | Covered by `benchmarks/lite-perf` pointer | Perf thresholds are not stable CI examples. |
| API < 100ms | Latency recorded by extension; no threshold | Mechanism is deterministic, wall-clock threshold is not. |
| DB resilience/retry | Failure injected by presetting the driver atom; `store` retries the driver once (2 attempts, exhaustion propagates to the caller); reconnect releases `store` and the `storeDriver` controller, then re-resolves — product atoms only | No test-only branches in product code; the composition root never introspects presets. |
| MTTR metric | `meanTimeToRecovery` is kept as a module boundary, with empty-window guard | API transport shape is not material to the lite patterns. |
| Hourly incident aggregation | Represented by watch-driven `activeIncidentCount` instead of wall-clock buckets | Pins reactive aggregation mechanics without adding date-bucket persistence. |

## Boundary Map

| Operation | Boundary |
|---|---|
| register service | `registerService` |
| register raw input | `registerService` parse path |
| update service | `updateService` |
| deregister service | `deregisterService` |
| list services | `listServices` |
| get service detail + recent checks | `getService` |
| run check | `runCheck` plus chain `tx` |
| health history range | `healthHistory` |
| current health | `currentHealth` |
| detect incident transition | `detectTransition` plus chain `tx` |
| list active incidents | `activeIncidents` |
| incidents by service | `serviceIncidents` |
| uptime | `uptime` |
| MTTR | `meanTimeToRecovery` |
| active incident count | `activeIncidentCount` derived aggregate |
| scheduler start | `scheduler` lifecycle |
| store reconnect | `store` release + `storeDriver` controller release, then re-resolve |

## Data Model

### Service

```typescript
{
  id: string
  name: string
  type: "http" | "tcp" | "custom"
  endpoint: string
  checkInterval: number
  timeout: number
  criticality: "low" | "medium" | "high" | "critical"
  createdAt: number
  updatedAt: number
}
```

### HealthCheck

```typescript
{
  id: string
  serviceId: string
  status: "healthy" | "unhealthy" | "unknown"
  responseTime: number | null
  error: string | null
  timestamp: number
}
```

### Incident

```typescript
{
  id: string
  serviceId: string
  startedAt: number
  recoveredAt: number | null
  duration: number | null
  checksFailedCount: number
}
```

## Success Criteria

| SC | Acceptance |
|---|---|
| SC1 | Register 100 services through the API and list 100 service statuses. |
| SC2 | Fake clock for one hour runs each scheduled service exactly `3600 / interval` times. |
| SC3 | Forced unhealthy executor opens an incident within one interval tick. |
| SC4 | Observability extension records latency for every execution, including scheduled checks and failed executions. |
| SC5 | Uptime arithmetic is exact for synthetic 90d, 30d, and 7d windows; empty windows return zero. |
| SC6 | Preset flaky driver retries a transient failure; explicit reconnect releases product atoms only and service operations keep working (preset-redirected drivers survive reconnect — pinned lite redirect semantics). |
| SC7 | Dispose leaves zero live timers, runs cleanups, and waits for in-flight checks. |
| SC8 | Alert hook receives incident open and resolve events end to end. |
