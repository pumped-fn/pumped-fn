import { atom, controller, tag, tags } from "@pumped-fn/lite"
import { sessionToken } from "./session"

export interface DashboardView {
  summary: {
    total: number
    healthy: number
    unhealthy: number
    unknown: number
    activeIncidents: number
  }
  attention: Array<{ id: string; name: string; status: string; criticality: string }>
}

export interface BffClient {
  login(email: string, password: string): Promise<{ token: string }>
  dashboard(token: string): Promise<DashboardView>
}

export interface BffHttp {
  post<T>(path: string, body: unknown): Promise<T>
  get<T>(path: string, token: string): Promise<T>
}

export interface AuthedBffClient {
  dashboard(): Promise<DashboardView>
}

export const bffBaseUrl = tag<string>({ label: "thin.bff.baseUrl", default: "http://localhost:4001" })

export const bffHttp = atom({
  deps: { baseUrl: tags.required(bffBaseUrl) },
  factory: (_ctx, { baseUrl }): BffHttp => ({
    post: async <T>(path: string, body: unknown) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`bff ${path} failed: ${response.status}`)
      return (await response.json()) as T
    },
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
    login: (email, password) => http.post<{ token: string }>("/login", { email, password }),
    dashboard: (token) => http.get<DashboardView>("/dashboard", token),
  }),
})

export const authedBffClient = atom({
  deps: {
    client: bffClient,
    tokenControl: controller(sessionToken, { resolve: true, watch: true }),
  },
  factory: (_ctx, { client, tokenControl }): AuthedBffClient | null => {
    const token = tokenControl.get()
    if (token === null) return null
    return {
      dashboard: () => client.dashboard(token),
    }
  },
})
