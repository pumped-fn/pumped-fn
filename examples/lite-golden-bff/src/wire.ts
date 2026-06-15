export type Status = "healthy" | "unhealthy" | "unknown"

export type Criticality = "low" | "medium" | "high" | "critical"

export interface Service {
  id: string
  name: string
  type: "http" | "tcp" | "custom"
  endpoint: string
  checkInterval: number
  timeout: number
  criticality: Criticality
  createdAt: number
  updatedAt: number
}

export interface ServiceStatus extends Service {
  status: Status
}

export interface HealthCheck {
  id: string
  serviceId: string
  status: Status
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

export interface ServiceDetail extends ServiceStatus {
  recentChecks: HealthCheck[]
  incidents: Incident[]
}
