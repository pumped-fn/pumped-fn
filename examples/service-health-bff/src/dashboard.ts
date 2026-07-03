import { flow } from "@pumped-fn/lite"
import { capstoneClient } from "./client"
import type { Criticality, Status } from "./wire"

export interface AttentionRow {
  id: string
  name: string
  status: Status
  criticality: Criticality
}

export interface DashboardView {
  summary: {
    total: number
    healthy: number
    unhealthy: number
    unknown: number
    activeIncidents: number
  }
  attention: AttentionRow[]
}

const rank: Record<Criticality, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const dashboardView = flow({
  name: "dashboard-view",
  deps: { client: capstoneClient },
  factory: async (_ctx, { client }): Promise<DashboardView> => {
    const [services, incidents] = await Promise.all([client.listServices(), client.activeIncidents()])
    const count = (status: Status) => services.filter((s) => s.status === status).length
    const attention = services
      .filter((s) => s.status !== "healthy")
      .sort((a, b) => rank[a.criticality] - rank[b.criticality])
      .map((s) => ({ id: s.id, name: s.name, status: s.status, criticality: s.criticality }))
    return {
      summary: {
        total: services.length,
        healthy: count("healthy"),
        unhealthy: count("unhealthy"),
        unknown: count("unknown"),
        activeIncidents: incidents.length,
      },
      attention,
    }
  },
})
