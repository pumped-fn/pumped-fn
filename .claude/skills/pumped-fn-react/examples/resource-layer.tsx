// Resource Layer Example
// Shows how to structure API clients, WebSocket, and SSE as executors

import { provide, derive, tag, custom } from '@pumped-fn/core-next'

// ===== Tags for configuration =====
export const apiBaseUrl = tag(custom<string>(), {
  label: 'api.baseUrl'
})

export const authToken = tag(custom<string | null>(), {
  label: 'auth.token',
  default: null
})

// ===== Base API client =====
export const apiClient = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const token = authToken.find(controller.scope)

  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${base}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    },
    post: async <T>(path: string, body: unknown): Promise<T> => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      return res.json()
    }
  }
})

// ===== Protected API (requires auth) =====
export const currentUser = provide((controller) => {
  const api = apiClient.get(controller.scope)
  return api.get<{ id: string; name: string; roles: Array<{ permissions: string[] }> }>('/me')
})

export const protectedApi = derive(
  { api: apiClient, user: currentUser.reactive },
  ({ api, user }) => {
    if (!user) throw new Error('Not authenticated')
    return api
  }
)

// ===== WebSocket resource =====
export const chatSocket = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const wsUrl = base.replace('http', 'ws') + '/chat'
  const ws = new WebSocket(wsUrl)

  controller.cleanup(() => {
    ws.close()
  })

  return ws
})

// ===== SSE resource =====
export const notificationStream = provide((controller) => {
  const base = apiBaseUrl.get(controller.scope)
  const token = authToken.get(controller.scope)

  const events = new EventSource(`${base}/notifications`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  controller.cleanup(() => {
    events.close()
  })

  return events
})
