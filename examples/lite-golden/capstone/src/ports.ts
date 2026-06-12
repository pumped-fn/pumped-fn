import type { Lite } from "@pumped-fn/lite"
import type { HealthCheck, Incident, Service } from "./domain"

export interface ClockPort {
  now(): number
  every(ms: number, fn: () => void): () => void
}
export interface StoreTx {
  checks: Pick<StorePort["checks"], "append">
  incidents: Pick<StorePort["incidents"], "open" | "close">
  commit(): Promise<void>
  rollback(): Promise<void>
}
export interface StorePort {
  services: { upsert(s: Service): void; get(id: string): Service | undefined; delete(id: string): boolean; list(): Service[] }
  checks: { append(c: HealthCheck): void; range(serviceId: string, from: number, to: number): HealthCheck[]; latest(serviceId: string): HealthCheck | undefined }
  incidents: { open(i: Incident): void; close(id: string, recoveredAt: number): void; active(): Incident[]; byService(serviceId: string): Incident[] }
  begin(): StoreTx
}
export type CheckExecutor = (ctx: Lite.ExecutionContext, service: Service) => Promise<{ status: HealthCheck["status"]; responseTime: number | null; error: string | null }>
