import { atom, tag, tags } from "@pumped-fn/lite"

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

export const bffBaseUrl = tag<string>({ label: "thin.bff.baseUrl", default: "http://localhost:4001" })

export const bffClient = atom({
  deps: { baseUrl: tags.required(bffBaseUrl) },
  factory: (_ctx, { baseUrl }): BffClient => {
    const post = async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`bff ${path} failed: ${res.status}`)
      return (await res.json()) as T
    }
    const get = async <T>(path: string, token: string): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`bff ${path} failed: ${res.status}`)
      return (await res.json()) as T
    }
    return {
      login: (email, password) => post<{ token: string }>("/login", { email, password }),
      dashboard: (token) => get<DashboardView>("/dashboard", token),
    }
  },
})
