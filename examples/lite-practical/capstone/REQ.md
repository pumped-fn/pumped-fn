# Service Health Monitor

## Problem Statement

Build a service health monitor that tracks availability, stores check history, opens and resolves incidents, records observability data, and shuts down cleanly.

## Scope Delta From Original REQ

| Original | Capstone | Reason |
|---|---|---|
| SQLite datastore | `StorePort` interface plus in-memory driver atom | Deterministic and preset-swappable; persistence is orthogonal to the lite patterns. |
| "Pod" per request | `ExecutionContext` per API call or scheduled check | The current lite boundary is the execution context. |
| HTTP endpoints | boundary flows are the seam: `registerService`, `runCheck`, etc.; composition at the use site via `createScope` + `ctx.exec({ flow, input })`; watch-derived aggregates read atoms directly | Transport is out of scope; flows are the honest boundary — no wrapper facade. |
| Plugin hooks | `Lite.Extension` for alerting and observability | Uses the actual extension API. |
| 1000+ services perf | Covered by `benchmarks/lite-perf` pointer | Perf thresholds are not stable CI examples. |
| API < 100ms | Latency recorded by extension; no threshold | Mechanism is deterministic, wall-clock threshold is not. |
| DB resilience/retry | Failure injected by presetting the driver atom; `store` retries the driver once (2 attempts, exhaustion propagates to the caller); `reconnectStore` releases `store` and the `storeDriver` controller, then re-resolves — product atoms only | No test-only branches in product code; the composition root never introspects presets. |
| MTTR metric | `meanTimeToRecovery` is kept as a module boundary, with empty-window guard | API transport shape is not material to the lite patterns. |
| Hourly incident aggregation | Represented by watch-driven `activeIncidentCount` instead of wall-clock buckets | Pins reactive aggregation mechanics without adding date-bucket persistence. |

## Boundary Map

| Operation | Boundary |
|---|---|
| register service | `registerService` flow |
| register raw input | `registerService` flow parse path |
| update service | `updateService` flow |
| deregister service | `deregisterService` flow |
| list services | `listServices` flow |
| get service detail + recent checks | `getService` flow |
| run check | `runCheck` flow + chain `tx` resource |
| health history range | `healthHistory` flow |
| current health | `currentHealth` flow |
| detect incident transition | `detectTransition` flow + chain `tx` resource |
| list active incidents | `activeIncidents` flow |
| incidents by service | `serviceIncidents` flow |
| uptime | `uptime` flow |
| MTTR | `meanTimeToRecovery` flow |
| active incident count | `activeIncidentCount` atom (watch-derived aggregate) |
| scheduler start | `scope.resolve(scheduler)` at use site |
| store reconnect | `reconnectStore` flow exported from `infra/store.ts` |

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
