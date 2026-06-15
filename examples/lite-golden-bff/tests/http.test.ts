import { describe, expect, test } from "vitest"
import { createScope, preset, type Lite } from "@pumped-fn/lite"
import {
  InvalidCredentials,
  InvalidSession,
  authProvider,
  validateSession,
  type AuthProvider,
  type Session,
} from "../src/auth"
import { capstoneClient, type CapstoneClient } from "../src/client"
import { handleBffRequest } from "../src/http"
import { dashboardView, type DashboardView } from "../src/dashboard"
import type { Incident, ServiceStatus } from "../src/wire"

const session: Session = { token: "tok-login", user: { id: "u1", name: "Alice" } }

const services: ServiceStatus[] = [
  {
    id: "api",
    name: "api",
    type: "http",
    endpoint: "https://api.example.test",
    checkInterval: 30,
    timeout: 1000,
    criticality: "critical",
    status: "unhealthy",
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "web",
    name: "web",
    type: "http",
    endpoint: "https://web.example.test",
    checkInterval: 30,
    timeout: 1000,
    criticality: "low",
    status: "healthy",
    createdAt: 0,
    updatedAt: 0,
  },
]

const incidents: Incident[] = [
  { id: "i1", serviceId: "api", startedAt: 0, recoveredAt: null, duration: null, checksFailedCount: 2 },
]

const dashboard: DashboardView = {
  summary: { total: 2, healthy: 1, unhealthy: 1, unknown: 0, activeIncidents: 1 },
  attention: [{ id: "api", name: "api", status: "unhealthy", criticality: "critical" }],
}

function fakeClient(over: Partial<CapstoneClient> = {}): CapstoneClient {
  return {
    listServices: async () => services,
    activeIncidents: async () => incidents,
    uptime: async () => 100,
    getService: async () => {
      throw new Error("not used")
    },
    ...over,
  }
}

function recordParentContexts(targets: readonly Lite.AnyFlow[], parents: Lite.ExecutionContext[]): Lite.Extension {
  return {
    name: "record-parent-contexts",
    wrapExec: async (next, target, ctx) => {
      if (targets.some((flow) => flow === target) && ctx.parent) parents.push(ctx.parent)
      return next()
    },
  }
}

describe("outside-in", () => {
  test("OI1: POST /login returns token JSON through the login flow", async () => {
    const calls: Array<{ email: string; password: string }> = []
    const auth: AuthProvider = {
      authenticate: async (email, password) => {
        calls.push({ email, password })
        return session
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })

    const response = await handleBffRequest(scope, {
      method: "POST",
      path: "/login",
      body: { email: "a@b.com", password: "pass" },
    })

    expect(response).toEqual({ status: 200, body: { token: session.token } })
    expect(calls).toEqual([{ email: "a@b.com", password: "pass" }])
    await scope.dispose()
  })

  test("OI2: POST /login maps auth failure to a 401 JSON error", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new InvalidCredentials()
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })

    const response = await handleBffRequest(scope, {
      method: "POST",
      path: "/login",
      body: { email: "a@b.com", password: "wrong" },
    })

    expect(response).toEqual({ status: 401, body: { error: "invalid credentials" } })
    await scope.dispose()
  })

  test("OI3: POST /login preserves auth provider internal failures", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("auth provider unavailable")
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })

    await expect(
      handleBffRequest(scope, {
        method: "POST",
        path: "/login",
        body: { email: "a@b.com", password: "pass" },
      })
    ).rejects.toThrow("auth provider unavailable")
    await scope.dispose()
  })

  test("OI4: wrong route methods and unknown paths return route errors before graph work", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })

    await expect(
      handleBffRequest(scope, { method: "GET", path: "/login" })
    ).resolves.toEqual({ status: 405, body: { error: "method not allowed" } })
    await expect(
      handleBffRequest(scope, { method: "POST", path: "/dashboard" })
    ).resolves.toEqual({ status: 405, body: { error: "method not allowed" } })
    await expect(
      handleBffRequest(scope, { method: "GET", path: "/unknown" })
    ).resolves.toEqual({ status: 404, body: { error: "not found" } })
    await scope.dispose()
  })

  test("OI5: GET /dashboard validates Bearer auth and returns DashboardView JSON", async () => {
    const tokens: string[] = []
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async (token) => {
        tokens.push(token)
        return session
      },
    }
    const scope = createScope({
      presets: [preset(authProvider, auth), preset(capstoneClient, fakeClient())],
    })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
      headers: { Authorization: "Bearer tok-dashboard" },
    })

    expect(response).toEqual({ status: 200, body: dashboard })
    expect(tokens).toEqual(["tok-dashboard"])
    await scope.dispose()
  })

  test("OI6: GET /dashboard accepts lowercase authorization header", async () => {
    const tokens: string[] = []
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async (token) => {
        tokens.push(token)
        return session
      },
    }
    const scope = createScope({
      presets: [preset(authProvider, auth), preset(capstoneClient, fakeClient())],
    })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
      headers: { authorization: "Bearer tok-lower" },
    })

    expect(response).toEqual({ status: 200, body: dashboard })
    expect(tokens).toEqual(["tok-lower"])
    await scope.dispose()
  })

  test("OI7: GET /dashboard without auth returns a 401 JSON error before dashboard work", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const client = fakeClient({
      listServices: async () => {
        throw new Error("not used")
      },
    })
    const scope = createScope({
      presets: [preset(authProvider, auth), preset(capstoneClient, client)],
    })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
    })

    expect(response).toEqual({ status: 401, body: { error: "unauthorized" } })
    await scope.dispose()
  })

  test("OI8: GET /dashboard with invalid Bearer auth returns a 401 JSON error", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => {
        throw new InvalidSession()
      },
    }
    const client = fakeClient({
      listServices: async () => {
        throw new Error("not used")
      },
    })
    const scope = createScope({
      presets: [preset(authProvider, auth), preset(capstoneClient, client)],
    })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
      headers: { Authorization: "Bearer bad-token" },
    })

    expect(response).toEqual({ status: 401, body: { error: "unauthorized" } })
    await scope.dispose()
  })

  test("OI9: GET /dashboard preserves auth provider internal failures", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => {
        throw new Error("auth provider unavailable")
      },
    }
    const scope = createScope({
      presets: [preset(authProvider, auth), preset(capstoneClient, fakeClient())],
    })

    await expect(
      handleBffRequest(scope, {
        method: "GET",
        path: "/dashboard",
        headers: { Authorization: "Bearer tok-dashboard" },
      })
    ).rejects.toThrow("auth provider unavailable")
    await scope.dispose()
  })

  test("OI10: GET /dashboard with non-Bearer auth returns a 401 JSON error", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
      headers: { Authorization: "Basic tok-dashboard" },
    })

    expect(response).toEqual({ status: 401, body: { error: "unauthorized" } })
    await scope.dispose()
  })

  test("OI11: GET /dashboard validates auth and builds the view in one request context", async () => {
    const parents: Lite.ExecutionContext[] = []
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => session,
    }
    const scope = createScope({
      extensions: [recordParentContexts([validateSession, dashboardView], parents)],
      presets: [preset(authProvider, auth), preset(capstoneClient, fakeClient())],
    })

    const response = await handleBffRequest(scope, {
      method: "GET",
      path: "/dashboard",
      headers: { Authorization: "Bearer tok-dashboard" },
    })

    expect(response).toEqual({ status: 200, body: dashboard })
    expect(parents).toHaveLength(2)
    expect(parents[0]).toBe(parents[1])
    await scope.dispose()
  })

  test("OI12: GET /dashboard preserves data failures after valid auth", async () => {
    const auth: AuthProvider = {
      authenticate: async () => {
        throw new Error("not used")
      },
      validate: async () => session,
    }
    const scope = createScope({
      presets: [
        preset(authProvider, auth),
        preset(capstoneClient, fakeClient({
          listServices: async () => {
            throw new Error("backend unavailable")
          },
        })),
      ],
    })

    await expect(
      handleBffRequest(scope, {
        method: "GET",
        path: "/dashboard",
        headers: { Authorization: "Bearer tok-dashboard" },
      })
    ).rejects.toThrow("backend unavailable")
    await scope.dispose()
  })
})
