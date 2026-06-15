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

export interface BffHttp {
  get<T>(path: string, token: string): Promise<T>
}

export interface AuthedBffClient {
  dashboard(): Promise<DashboardView>
}

export const bffBaseUrl = tag<string>({ label: "bff.baseUrl", default: "http://localhost:4001" })

export const bffHttp = atom({
  deps: { baseUrl: tags.required(bffBaseUrl) },
  factory: (_ctx, { baseUrl }): BffHttp => ({
    get: async <T>(path: string, token: string) => {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error(`bff ${path} failed: ${response.status}`)
      return (await response.json()) as T
    },
  }),
})

export const bffClient = atom({
  deps: { http: bffHttp },
  factory: (_ctx, { http }): BffClient => ({
    dashboard: (token) => http.get<DashboardView>("/dashboard", token),
  }),
})

export const authedBffClient = atom({
  deps: {
    client: bffClient,
    sessionControl: controller(session, { resolve: true, watch: true }),
  },
  factory: (_ctx, { client, sessionControl }): AuthedBffClient | null => {
    const s = sessionControl.get()
    if (s === null) return null
    return {
      dashboard: () => client.dashboard(s.token),
    }
  },
})

export const dashboard = atom({
  deps: { client: authedBffClient },
  factory: async (_ctx, { client }) => {
    if (client === null) return null
    return client.dashboard()
  },
})
