import { controller, flow, typed } from "@pumped-fn/lite"
import { InvalidCredentials, InvalidSession, login, validateSession } from "./auth"
import { dashboardView, type DashboardView } from "./dashboard"

export interface BffHeaders {
  Authorization?: string
  authorization?: string
}

export interface LoginRequest {
  method: "POST"
  path: "/login"
  body: { email: string; password: string }
}

export interface DashboardRequest {
  method: "GET"
  path: "/dashboard"
  headers?: BffHeaders
}

export interface UnknownRequest {
  method: string
  path: string
  body?: unknown
  headers?: BffHeaders
}

export type BffRequest = LoginRequest | DashboardRequest | UnknownRequest

export interface LoginResponse {
  token: string
}

export type BffError =
  | { error: "invalid credentials" }
  | { error: "unauthorized" }
  | { error: "not found" }
  | { error: "method not allowed" }

export interface BffResponse<T> {
  status: 200 | 401 | 404 | 405
  body: T
}

export type BffResult = BffResponse<LoginResponse | DashboardView | BffError>

export const handleBffRequest = flow({
  name: "handle-bff-request",
  parse: typed<BffRequest>(),
  deps: { dashboardView: controller(dashboardView), login: controller(login), validateSession: controller(validateSession) },
  factory: async (ctx, { dashboardView, login, validateSession }): Promise<BffResult> => {
    const request = ctx.input
    if (request.path === "/login") {
      if (request.method !== "POST") return { status: 405, body: { error: "method not allowed" } }
      try {
        const session = await login.exec({ input: (request as LoginRequest).body })
        return { status: 200, body: { token: session.token } }
      } catch (error) {
        if (error instanceof InvalidCredentials) return { status: 401, body: { error: "invalid credentials" } }
        throw error
      }
    }
    if (request.path === "/dashboard") {
      if (request.method !== "GET") return { status: 405, body: { error: "method not allowed" } }
      const token = bearerToken(request as DashboardRequest)
      if (token === null) return { status: 401, body: { error: "unauthorized" } }
      try {
        await validateSession.exec({ input: { token } })
      } catch (error) {
        if (error instanceof InvalidSession) return { status: 401, body: { error: "unauthorized" } }
        throw error
      }
      return { status: 200, body: await dashboardView.exec() }
    }
    return { status: 404, body: { error: "not found" } }
  },
})

function bearerToken(request: DashboardRequest): string | null {
  const value = request.headers?.Authorization ?? request.headers?.authorization
  if (value === undefined) return null
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : null
}
