// Protocol Abstraction Example
// Shows how to inject transport layer via tags

import { tag, custom, provide } from '@pumped-fn/core-next'

// ===== Define transport interface =====
export type RPCTransport = {
  call: <T>(method: string, params: unknown) => Promise<T>
}

export const rpcTransport = tag(custom<RPCTransport>(), {
  label: 'rpc.transport'
})

// ===== RPC client (protocol-agnostic) =====
type User = { id: string; name: string; email: string }
type Post = { id: string; title: string; content: string }
type PostData = { title: string; content: string }

export const rpcClient = provide((controller) => {
  const transport = rpcTransport.get(controller.scope)

  return {
    getUser: (id: string) => transport.call<User>('user.get', { id }),
    listUsers: () => transport.call<User[]>('user.list', {}),
    getPosts: () => transport.call<Post[]>('posts.list', {}),
    createPost: (data: PostData) => transport.call<Post>('posts.create', data),
    deletePost: (id: string) => transport.call<void>('posts.delete', { id })
  }
})

// ===== Transport implementations =====

// Fetch-based JSON-RPC
export const fetchRPCTransport: RPCTransport = {
  call: async (method, params) => {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
    })
    const json = await res.json()
    if (json.error) throw new Error(json.error.message)
    return json.result
  }
}

// REST API adapter
export const restTransport: RPCTransport = {
  call: async (method, params) => {
    const [resource, action] = method.split('.')

    const routes: Record<string, () => Promise<Response>> = {
      'user.get': () => fetch(`/api/users/${(params as { id: string }).id}`),
      'user.list': () => fetch('/api/users'),
      'posts.list': () => fetch('/api/posts'),
      'posts.create': () => fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      }),
      'posts.delete': () => fetch(`/api/posts/${(params as { id: string }).id}`, {
        method: 'DELETE'
      })
    }

    const res = await routes[method]()
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json()
  }
}

// gRPC Web transport
export const grpcTransport: RPCTransport = {
  call: async (method, params) => {
    // Example gRPC-web client implementation
    const client = getGrpcClient() // Hypothetical gRPC client
    const [service, rpc] = method.split('.')
    return client.call(service, rpc, params)
  }
}

// WebSocket RPC transport
export const wsTransport: RPCTransport = {
  call: async (method, params) => {
    const ws = getWebSocket() // Hypothetical WebSocket connection

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36)

      ws.send(JSON.stringify({ id, method, params }))

      const handler = (event: MessageEvent) => {
        const msg = JSON.parse(event.data)
        if (msg.id === id) {
          ws.removeEventListener('message', handler)
          if (msg.error) reject(new Error(msg.error))
          else resolve(msg.result)
        }
      }

      ws.addEventListener('message', handler)
    })
  }
}

// Mock transport for testing
export const mockTransport: RPCTransport = {
  call: async (method, params) => {
    const mockData: Record<string, unknown> = {
      'user.get': { id: '1', name: 'Alice', email: 'alice@example.com' },
      'user.list': [
        { id: '1', name: 'Alice', email: 'alice@example.com' },
        { id: '2', name: 'Bob', email: 'bob@example.com' }
      ],
      'posts.list': [
        { id: '1', title: 'First Post', content: 'Content 1' },
        { id: '2', title: 'Second Post', content: 'Content 2' }
      ],
      'posts.create': { id: '3', ...(params as PostData) },
      'posts.delete': undefined
    }

    return mockData[method]
  }
}

// ===== Usage in app initialization =====
import { createScope } from '@pumped-fn/core-next'

// Production: use fetch-based RPC
export const appScope = createScope({
  tags: [rpcTransport(fetchRPCTransport)]
})

// Development: use REST API
export const devScope = createScope({
  tags: [rpcTransport(restTransport)]
})

// Testing: use mock
export const testScope = createScope({
  tags: [rpcTransport(mockTransport)]
})

// Helpers
function getGrpcClient(): any {
  throw new Error('Not implemented')
}

function getWebSocket(): WebSocket {
  throw new Error('Not implemented')
}
