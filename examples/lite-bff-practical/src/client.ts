import { atom, tag, tags } from "@pumped-fn/lite"
import type { Incident, ServiceDetail, ServiceStatus } from "./wire"

export type Period = "7d" | "30d" | "90d"

export interface CapstoneClient {
  listServices(): Promise<ServiceStatus[]>
  activeIncidents(): Promise<Incident[]>
  uptime(serviceId: string, period: Period): Promise<number>
  getService(id: string): Promise<ServiceDetail>
}

export interface CapstoneHttp {
  get<T>(path: string): Promise<T>
}

export const capstoneBaseUrl = tag<string>({ label: "capstone.baseUrl", default: "http://localhost:3000" })

export const capstoneHttp = atom({
  deps: { baseUrl: tags.required(capstoneBaseUrl) },
  factory: (_ctx, { baseUrl }): CapstoneHttp => ({
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`)
      if (!res.ok) throw new Error(`capstone ${path} failed: ${res.status}`)
      return (await res.json()) as T
    },
  }),
})

export const capstoneClient = atom({
  deps: { http: capstoneHttp },
  factory: (_ctx, { http }): CapstoneClient => ({
    listServices: () => http.get<ServiceStatus[]>("/services"),
    activeIncidents: () => http.get<Incident[]>("/incidents/active"),
    uptime: (serviceId, period) => http.get<number>(`/metrics/uptime/${serviceId}?period=${period}`),
    getService: (id) => http.get<ServiceDetail>(`/services/${id}`),
  }),
})
