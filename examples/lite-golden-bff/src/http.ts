import { flow, typed, type Lite } from "@pumped-fn/lite"
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
  factory: async (ctx): Promise<BffResult> => {
    const request = ctx.input
    if (request.path === "/login") {
      if (request.method !== "POST") return { status: 405, body: { error: "method not allowed" } }
      return handleLogin(ctx, request as LoginRequest)
    }
    if (request.path === "/dashboard") {
      if (request.method !== "GET") return { status: 405, body: { error: "method not allowed" } }
      return handleDashboard(ctx, request as DashboardRequest)
    }
    return { status: 404, body: { error: "not found" } }
  },
})

async function handleLogin(
  ctx: Lite.ExecutionContext,
  request: LoginRequest
): Promise<BffResponse<LoginResponse | BffError>> {
  try {
    const session = await ctx.exec({ flow: login, input: request.body })
    return { status: 200, body: { token: session.token } }
  } catch (error) {
    if (error instanceof InvalidCredentials) return { status: 401, body: { error: "invalid credentials" } }
    throw error
  }
}

async function handleDashboard(
  ctx: Lite.ExecutionContext,
  request: DashboardRequest
): Promise<BffResponse<DashboardView | BffError>> {
  const token = bearerToken(request)
  if (token === null) return { status: 401, body: { error: "unauthorized" } }
  if (!(await validateDashboardToken(ctx, token))) return { status: 401, body: { error: "unauthorized" } }
  return { status: 200, body: await ctx.exec({ flow: dashboardView }) }
}

async function validateDashboardToken(ctx: Lite.ExecutionContext, token: string): Promise<boolean> {
  try {
    await ctx.exec({ flow: validateSession, input: { token } })
    return true
  } catch (error) {
    if (error instanceof InvalidSession) return false
    throw error
  }
}

function bearerToken(request: DashboardRequest): string | null {
  const value = request.headers?.Authorization ?? request.headers?.authorization
  if (value === undefined) return null
  return value.startsWith("Bearer ") ? value.slice("Bearer ".length) : null
}
