import { flow, typed } from "@pumped-fn/lite"
import { capstoneClient, type Period } from "./client"
import type { Status } from "./wire"

export interface DetailCheck {
  status: Status
  responseTime: number | null
  timestamp: number
}

export interface ServiceDetailView {
  id: string
  name: string
  status: Status
  uptimeLabel: string
  recentChecks: DetailCheck[]
  openIncidents: number
}

export const serviceDetailView = flow({
  name: "service-detail-view",
  parse: typed<{ serviceId: string; period: Period }>(),
  deps: { client: capstoneClient },
  factory: async (ctx, { client }): Promise<ServiceDetailView> => {
    const detail = await client.getService(ctx.input.serviceId)
    const uptime = await client.uptime(ctx.input.serviceId, ctx.input.period)
    return {
      id: detail.id,
      name: detail.name,
      status: detail.status,
      uptimeLabel: `${uptime.toFixed(2)}%`,
      recentChecks: detail.recentChecks.map((c) => ({
        status: c.status,
        responseTime: c.responseTime,
        timestamp: c.timestamp,
      })),
      openIncidents: detail.incidents.filter((i) => i.recoveredAt === null).length,
    }
  },
})
