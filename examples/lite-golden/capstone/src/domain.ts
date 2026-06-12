export interface Service {
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

export interface HealthCheck {
  id: string
  serviceId: string
  status: "healthy" | "unhealthy" | "unknown"
  responseTime: number | null
  error: string | null
  timestamp: number
}

export interface Incident {
  id: string
  serviceId: string
  startedAt: number
  recoveredAt: number | null
  duration: number | null
  checksFailedCount: number
}

export class NotFoundError extends Error {
  override readonly name = "NotFoundError"

  constructor(readonly entity: string, readonly id: string) {
    super(`${entity} not found: ${id}`)
  }
}
