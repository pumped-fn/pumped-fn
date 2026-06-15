import { atom, controller, tag, tags } from "@pumped-fn/lite"
import { session } from "./auth"

export type Status = "healthy" | "unhealthy" | "unknown"
export type Criticality = "low" | "medium" | "high" | "critical"

export interface DashboardView {
  summary: {
    total: number
    healthy: number
    unhealthy: number
    unknown: number
    activeIncidents: number
  }
  attention: Array<{ id: string; name: string; status: Status; criticality: Criticality }>
}

export interface BffClient {
  dashboard(token: string): Promise<DashboardView>
}

export const bffBaseUrl = tag<string>({ label: "bff.baseUrl", default: "http://localhost:4001" })

export const bffClient = atom({
  deps: { baseUrl: tags.required(bffBaseUrl) },
  factory: (_ctx, { baseUrl }): BffClient => {
    const get = async <T>(path: string, token: string): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`bff ${path} failed: ${res.status}`)
      return (await res.json()) as T
    }
    return {
      dashboard: (token) => get<DashboardView>("/dashboard", token),
    }
  },
})

export const dashboard = atom({
  deps: {
    client: bffClient,
    sessionControl: controller(session, { resolve: true, watch: true }),
  },
  factory: async (_ctx, { client, sessionControl }) => {
    const s = sessionControl.get()
    if (s === null) return null
    return client.dashboard(s.token)
  },
})
