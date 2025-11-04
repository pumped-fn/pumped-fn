# Multi-Tenant Todo Actor System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-tenant todo system using actor pattern with pumped-fn where tenants and todos are managed as isolated actors with message-based communication.

**Architecture:** Each tenant is an actor with isolated state managing its own todo items. Tenant actors receive messages (create todo, update todo, delete todo) and process them sequentially. An actor registry supervises all tenant actors, handling spawn/kill operations. All communication is type-safe with discriminated unions.

**Tech Stack:** @pumped-fn/core-next, TypeScript, vitest (testing), tsx (runtime)

---

## Task 1: Project Setup

**Files:**
- Create: `examples/multi-tenant-todo/actor.tenant.ts`
- Create: `examples/multi-tenant-todo/actor.tenant.test.ts`
- Create: `examples/multi-tenant-todo/types.ts`
- Modify: `examples/package.json`

**Step 1: Create type definitions**

Create `examples/multi-tenant-todo/types.ts`:

```typescript
export namespace Todo {
  export type Item = {
    id: string
    title: string
    completed: boolean
    createdAt: number
  }

  export type State = {
    tenantId: string
    todos: Map<string, Item>
  }
}

export namespace TenantMessage {
  export type CreateTodo = {
    type: 'CREATE_TODO'
    payload: { id: string; title: string }
  }

  export type UpdateTodo = {
    type: 'UPDATE_TODO'
    payload: { id: string; title?: string; completed?: boolean }
  }

  export type DeleteTodo = {
    type: 'DELETE_TODO'
    payload: { id: string }
  }

  export type GetTodos = {
    type: 'GET_TODOS'
    payload: Record<string, never>
  }

  export type Message = CreateTodo | UpdateTodo | DeleteTodo | GetTodos
}
```

**Step 2: Add script to package.json**

Modify `examples/package.json` scripts section:

```json
"dev:multi-tenant-todo": "tsx multi-tenant-todo/main.ts",
"test:multi-tenant-todo": "vitest run multi-tenant-todo"
```

**Step 3: Verify types compile**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add examples/multi-tenant-todo/types.ts examples/package.json
git commit -m "feat(examples): add multi-tenant todo types"
```

---

## Task 2: Tenant Actor Resource

**Files:**
- Create: `examples/multi-tenant-todo/actor.tenant.ts`
- Test: `examples/multi-tenant-todo/actor.tenant.test.ts`

**Step 1: Write failing test for tenant actor creation**

Create `examples/multi-tenant-todo/actor.tenant.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'
import type { Todo } from './types'

describe('Tenant Actor', () => {
  test('creates tenant actor with initial state', async () => {
    const scope = createScope()

    const actor = await scope.resolve(createTenantActor('tenant-1'))
    const state = actor.getState()

    expect(state.tenantId).toBe('tenant-1')
    expect(state.todos.size).toBe(0)

    await scope.dispose()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL with "Cannot find module './actor.tenant'"

**Step 3: Write minimal tenant actor implementation**

Create `examples/multi-tenant-todo/actor.tenant.ts`:

```typescript
import { provide } from '@pumped-fn/core-next'
import type { Todo, TenantMessage } from './types'

export const createTenantActor = (tenantId: string) => {
  return provide((controller) => {
    const state: Todo.State = {
      tenantId,
      todos: new Map()
    }

    const messageQueue: TenantMessage.Message[] = []
    let processing = false

    const processNextMessage = async (): Promise<void> => {
      if (processing || messageQueue.length === 0) return

      processing = true
      const message = messageQueue.shift()

      if (message) {
        switch (message.type) {
          case 'CREATE_TODO': {
            const todo: Todo.Item = {
              id: message.payload.id,
              title: message.payload.title,
              completed: false,
              createdAt: Date.now()
            }
            state.todos.set(todo.id, todo)
            break
          }

          case 'UPDATE_TODO': {
            const existing = state.todos.get(message.payload.id)
            if (existing) {
              const updated: Todo.Item = {
                ...existing,
                title: message.payload.title ?? existing.title,
                completed: message.payload.completed ?? existing.completed
              }
              state.todos.set(message.payload.id, updated)
            }
            break
          }

          case 'DELETE_TODO': {
            state.todos.delete(message.payload.id)
            break
          }

          case 'GET_TODOS':
            break
        }
      }

      processing = false

      if (messageQueue.length > 0) {
        setImmediate(() => processNextMessage())
      }
    }

    controller.cleanup(async () => {
      while (messageQueue.length > 0) {
        await processNextMessage()
      }
    })

    return {
      send: (message: TenantMessage.Message) => {
        messageQueue.push(message)
        processNextMessage()
      },

      getState: () => state,

      getTodos: () => Array.from(state.todos.values())
    }
  })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add examples/multi-tenant-todo/actor.tenant.ts examples/multi-tenant-todo/actor.tenant.test.ts
git commit -m "feat(examples): implement tenant actor resource"
```

---

## Task 3: Tenant Actor Message Processing Tests

**Files:**
- Modify: `examples/multi-tenant-todo/actor.tenant.test.ts`

**Step 1: Write test for CREATE_TODO message**

Add to `examples/multi-tenant-todo/actor.tenant.test.ts`:

```typescript
test('processes CREATE_TODO message', async () => {
  const scope = createScope()
  const actor = await scope.resolve(createTenantActor('tenant-1'))

  actor.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Write tests' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  const todos = actor.getTodos()
  expect(todos).toHaveLength(1)
  expect(todos[0]).toMatchObject({
    id: 'todo-1',
    title: 'Write tests',
    completed: false
  })

  await scope.dispose()
})
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 3: Write test for UPDATE_TODO message**

Add to test file:

```typescript
test('processes UPDATE_TODO message', async () => {
  const scope = createScope()
  const actor = await scope.resolve(createTenantActor('tenant-1'))

  actor.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Write tests' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  actor.send({
    type: 'UPDATE_TODO',
    payload: { id: 'todo-1', completed: true }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  const todos = actor.getTodos()
  expect(todos[0].completed).toBe(true)
  expect(todos[0].title).toBe('Write tests')

  await scope.dispose()
})
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 5: Write test for DELETE_TODO message**

Add to test file:

```typescript
test('processes DELETE_TODO message', async () => {
  const scope = createScope()
  const actor = await scope.resolve(createTenantActor('tenant-1'))

  actor.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Write tests' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  actor.send({
    type: 'DELETE_TODO',
    payload: { id: 'todo-1' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  const todos = actor.getTodos()
  expect(todos).toHaveLength(0)

  await scope.dispose()
})
```

**Step 6: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 7: Commit**

```bash
git add examples/multi-tenant-todo/actor.tenant.test.ts
git commit -m "test(examples): add tenant actor message processing tests"
```

---

## Task 4: Actor Registry Resource

**Files:**
- Create: `examples/multi-tenant-todo/resource.registry.ts`
- Create: `examples/multi-tenant-todo/resource.registry.test.ts`

**Step 1: Write failing test for registry**

Create `examples/multi-tenant-todo/resource.registry.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { actorRegistry } from './resource.registry'

describe('Actor Registry', () => {
  test('spawns and retrieves tenant actors', async () => {
    const scope = createScope()
    const registry = await scope.resolve(actorRegistry)

    const actor1 = registry.spawn('tenant-1')
    const actor2 = registry.spawn('tenant-2')

    expect(registry.get('tenant-1')).toBe(actor1)
    expect(registry.get('tenant-2')).toBe(actor2)
    expect(registry.list()).toEqual(['tenant-1', 'tenant-2'])

    await scope.dispose()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL with "Cannot find module './resource.registry'"

**Step 3: Write registry implementation**

Create `examples/multi-tenant-todo/resource.registry.ts`:

```typescript
import { provide, createScope } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'

export type TenantActor = Awaited<ReturnType<ReturnType<typeof createTenantActor>['resolve']>>

export const actorRegistry = provide((controller) => {
  const actors = new Map<string, TenantActor>()
  const scopes = new Map<string, Awaited<ReturnType<typeof createScope>>>()

  controller.cleanup(async () => {
    for (const [_id, scope] of scopes) {
      await scope.dispose()
    }
    actors.clear()
    scopes.clear()
  })

  return {
    spawn: (tenantId: string): TenantActor => {
      if (actors.has(tenantId)) {
        return actors.get(tenantId)!
      }

      const scope = createScope()
      scopes.set(tenantId, scope)

      const actorPromise = scope.resolve(createTenantActor(tenantId))
      let actor: TenantActor | null = null

      actorPromise.then(a => {
        actor = a
        actors.set(tenantId, a)
      })

      if (!actor) {
        throw new Error('Actor initialization failed')
      }

      return actor
    },

    get: (tenantId: string): TenantActor | undefined => {
      return actors.get(tenantId)
    },

    list: (): string[] => {
      return Array.from(actors.keys())
    },

    kill: async (tenantId: string): Promise<void> => {
      const scope = scopes.get(tenantId)
      if (scope) {
        await scope.dispose()
        scopes.delete(tenantId)
      }
      actors.delete(tenantId)
    }
  }
})
```

**Step 4: Run test - will fail due to async spawn**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL - spawn is synchronous but resolve is async

**Step 5: Fix registry to handle async properly**

Modify `examples/multi-tenant-todo/resource.registry.ts`:

```typescript
import { provide, createScope } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'

export type TenantActor = Awaited<ReturnType<ReturnType<typeof createTenantActor>['resolve']>>

export const actorRegistry = provide((controller) => {
  const actors = new Map<string, TenantActor>()
  const scopes = new Map<string, Awaited<ReturnType<typeof createScope>>>()

  controller.cleanup(async () => {
    for (const [_id, scope] of scopes) {
      await scope.dispose()
    }
    actors.clear()
    scopes.clear()
  })

  return {
    spawn: async (tenantId: string): Promise<TenantActor> => {
      if (actors.has(tenantId)) {
        return actors.get(tenantId)!
      }

      const scope = createScope()
      scopes.set(tenantId, scope)

      const actor = await scope.resolve(createTenantActor(tenantId))
      actors.set(tenantId, actor)

      return actor
    },

    get: (tenantId: string): TenantActor | undefined => {
      return actors.get(tenantId)
    },

    list: (): string[] => {
      return Array.from(actors.keys())
    },

    kill: async (tenantId: string): Promise<void> => {
      const scope = scopes.get(tenantId)
      if (scope) {
        await scope.dispose()
        scopes.delete(tenantId)
      }
      actors.delete(tenantId)
    }
  }
})
```

**Step 6: Update test to await spawn**

Modify `examples/multi-tenant-todo/resource.registry.test.ts`:

```typescript
test('spawns and retrieves tenant actors', async () => {
  const scope = createScope()
  const registry = await scope.resolve(actorRegistry)

  const actor1 = await registry.spawn('tenant-1')
  const actor2 = await registry.spawn('tenant-2')

  expect(registry.get('tenant-1')).toBe(actor1)
  expect(registry.get('tenant-2')).toBe(actor2)
  expect(registry.list()).toEqual(['tenant-1', 'tenant-2'])

  await scope.dispose()
})
```

**Step 7: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 8: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 9: Commit**

```bash
git add examples/multi-tenant-todo/resource.registry.ts examples/multi-tenant-todo/resource.registry.test.ts
git commit -m "feat(examples): implement actor registry resource"
```

---

## Task 5: Flow-based Message Handlers

**Files:**
- Create: `examples/multi-tenant-todo/flow.message-handler.ts`
- Create: `examples/multi-tenant-todo/flow.message-handler.test.ts`

**Step 1: Write test for CREATE_TODO flow handler**

Create `examples/multi-tenant-todo/flow.message-handler.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { flow } from '@pumped-fn/core-next'
import { handleCreateTodo } from './flow.message-handler'

describe('Message Handler Flows', () => {
  test('handleCreateTodo validates and creates todo', async () => {
    const result = await flow.execute(handleCreateTodo, {
      id: 'todo-1',
      title: 'Write tests',
      currentTodos: new Map()
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.todo.id).toBe('todo-1')
      expect(result.todo.title).toBe('Write tests')
      expect(result.todo.completed).toBe(false)
    }
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL with "Cannot find module './flow.message-handler'"

**Step 3: Write handleCreateTodo flow**

Create `examples/multi-tenant-todo/flow.message-handler.ts`:

```typescript
import { flow } from '@pumped-fn/core-next'
import type { Todo } from './types'

export namespace HandleCreateTodo {
  export type Input = {
    id: string
    title: string
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; todo: Todo.Item }
  export type Error =
    | { success: false; reason: 'EMPTY_TITLE' }
    | { success: false; reason: 'DUPLICATE_ID' }

  export type Result = Success | Error
}

export const handleCreateTodo = flow(
  async (ctx, input: HandleCreateTodo.Input): Promise<HandleCreateTodo.Result> => {
    const validation = await ctx.run('validate-input', () => {
      if (!input.title || input.title.trim() === '') {
        return { ok: false as const, reason: 'EMPTY_TITLE' as const }
      }

      if (input.currentTodos.has(input.id)) {
        return { ok: false as const, reason: 'DUPLICATE_ID' as const }
      }

      return { ok: true as const }
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const todo = await ctx.run('create-todo', () => {
      const item: Todo.Item = {
        id: input.id,
        title: input.title.trim(),
        completed: false,
        createdAt: Date.now()
      }
      return item
    })

    return { success: true, todo }
  }
)
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 5: Write test for validation errors**

Add to test file:

```typescript
test('handleCreateTodo rejects empty title', async () => {
  const result = await flow.execute(handleCreateTodo, {
    id: 'todo-1',
    title: '',
    currentTodos: new Map()
  })

  expect(result).toEqual({
    success: false,
    reason: 'EMPTY_TITLE'
  })
})

test('handleCreateTodo rejects duplicate id', async () => {
  const existingTodos = new Map([
    ['todo-1', {
      id: 'todo-1',
      title: 'Existing',
      completed: false,
      createdAt: Date.now()
    }]
  ])

  const result = await flow.execute(handleCreateTodo, {
    id: 'todo-1',
    title: 'New todo',
    currentTodos: existingTodos
  })

  expect(result).toEqual({
    success: false,
    reason: 'DUPLICATE_ID'
  })
})
```

**Step 6: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS (3 tests)

**Step 7: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add examples/multi-tenant-todo/flow.message-handler.ts examples/multi-tenant-todo/flow.message-handler.test.ts
git commit -m "feat(examples): implement CREATE_TODO flow handler"
```

---

## Task 6: UPDATE and DELETE Flow Handlers

**Files:**
- Modify: `examples/multi-tenant-todo/flow.message-handler.ts`
- Modify: `examples/multi-tenant-todo/flow.message-handler.test.ts`

**Step 1: Write test for UPDATE_TODO handler**

Add to `examples/multi-tenant-todo/flow.message-handler.test.ts`:

```typescript
test('handleUpdateTodo updates existing todo', async () => {
  const existingTodos = new Map([
    ['todo-1', {
      id: 'todo-1',
      title: 'Original',
      completed: false,
      createdAt: 123
    }]
  ])

  const result = await flow.execute(handleUpdateTodo, {
    id: 'todo-1',
    title: 'Updated',
    completed: true,
    currentTodos: existingTodos
  })

  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.todo.title).toBe('Updated')
    expect(result.todo.completed).toBe(true)
  }
})

test('handleUpdateTodo rejects non-existent todo', async () => {
  const result = await flow.execute(handleUpdateTodo, {
    id: 'todo-1',
    currentTodos: new Map()
  })

  expect(result).toEqual({
    success: false,
    reason: 'TODO_NOT_FOUND'
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL with "handleUpdateTodo is not defined"

**Step 3: Implement handleUpdateTodo**

Add to `examples/multi-tenant-todo/flow.message-handler.ts`:

```typescript
export namespace HandleUpdateTodo {
  export type Input = {
    id: string
    title?: string
    completed?: boolean
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; todo: Todo.Item }
  export type Error = { success: false; reason: 'TODO_NOT_FOUND' }

  export type Result = Success | Error
}

export const handleUpdateTodo = flow(
  async (ctx, input: HandleUpdateTodo.Input): Promise<HandleUpdateTodo.Result> => {
    const existing = await ctx.run('find-todo', () => {
      return input.currentTodos.get(input.id)
    })

    if (!existing) {
      return { success: false, reason: 'TODO_NOT_FOUND' }
    }

    const updated = await ctx.run('update-todo', () => {
      const item: Todo.Item = {
        ...existing,
        title: input.title ?? existing.title,
        completed: input.completed ?? existing.completed
      }
      return item
    })

    return { success: true, todo: updated }
  }
)
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 5: Write test for DELETE_TODO handler**

Add to test file:

```typescript
test('handleDeleteTodo deletes existing todo', async () => {
  const existingTodos = new Map([
    ['todo-1', {
      id: 'todo-1',
      title: 'To delete',
      completed: false,
      createdAt: 123
    }]
  ])

  const result = await flow.execute(handleDeleteTodo, {
    id: 'todo-1',
    currentTodos: existingTodos
  })

  expect(result).toEqual({
    success: true,
    deletedId: 'todo-1'
  })
})

test('handleDeleteTodo rejects non-existent todo', async () => {
  const result = await flow.execute(handleDeleteTodo, {
    id: 'todo-1',
    currentTodos: new Map()
  })

  expect(result).toEqual({
    success: false,
    reason: 'TODO_NOT_FOUND'
  })
})
```

**Step 6: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL with "handleDeleteTodo is not defined"

**Step 7: Implement handleDeleteTodo**

Add to `examples/multi-tenant-todo/flow.message-handler.ts`:

```typescript
export namespace HandleDeleteTodo {
  export type Input = {
    id: string
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; deletedId: string }
  export type Error = { success: false; reason: 'TODO_NOT_FOUND' }

  export type Result = Success | Error
}

export const handleDeleteTodo = flow(
  async (ctx, input: HandleDeleteTodo.Input): Promise<HandleDeleteTodo.Result> => {
    const exists = await ctx.run('check-exists', () => {
      return input.currentTodos.has(input.id)
    })

    if (!exists) {
      return { success: false, reason: 'TODO_NOT_FOUND' }
    }

    return { success: true, deletedId: input.id }
  }
)
```

**Step 8: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS (7 tests total)

**Step 9: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 10: Commit**

```bash
git add examples/multi-tenant-todo/flow.message-handler.ts examples/multi-tenant-todo/flow.message-handler.test.ts
git commit -m "feat(examples): implement UPDATE and DELETE flow handlers"
```

---

## Task 7: Integrate Flows with Tenant Actor

**Files:**
- Modify: `examples/multi-tenant-todo/actor.tenant.ts`
- Modify: `examples/multi-tenant-todo/actor.tenant.test.ts`

**Step 1: Write integration test**

Add to `examples/multi-tenant-todo/actor.tenant.test.ts`:

```typescript
test('actor uses flow handlers for message processing', async () => {
  const scope = createScope()
  const actor = await scope.resolve(createTenantActor('tenant-1'))

  actor.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Test' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  actor.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Duplicate' }
  })

  await new Promise(resolve => setTimeout(resolve, 50))

  const todos = actor.getTodos()
  expect(todos).toHaveLength(1)
  expect(todos[0].title).toBe('Test')

  await scope.dispose()
})
```

**Step 2: Run test to verify current behavior**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: FAIL - actor doesn't use flow validation yet

**Step 3: Refactor actor to use flow handlers**

Modify `examples/multi-tenant-todo/actor.tenant.ts`:

```typescript
import { provide, flow } from '@pumped-fn/core-next'
import type { Todo, TenantMessage } from './types'
import { handleCreateTodo, handleUpdateTodo, handleDeleteTodo } from './flow.message-handler'

export const createTenantActor = (tenantId: string) => {
  return provide((controller) => {
    const state: Todo.State = {
      tenantId,
      todos: new Map()
    }

    const messageQueue: TenantMessage.Message[] = []
    let processing = false

    const processNextMessage = async (): Promise<void> => {
      if (processing || messageQueue.length === 0) return

      processing = true
      const message = messageQueue.shift()

      if (message) {
        switch (message.type) {
          case 'CREATE_TODO': {
            const result = await flow.execute(handleCreateTodo, {
              id: message.payload.id,
              title: message.payload.title,
              currentTodos: state.todos
            })

            if (result.success) {
              state.todos.set(result.todo.id, result.todo)
            }
            break
          }

          case 'UPDATE_TODO': {
            const result = await flow.execute(handleUpdateTodo, {
              id: message.payload.id,
              title: message.payload.title,
              completed: message.payload.completed,
              currentTodos: state.todos
            })

            if (result.success) {
              state.todos.set(result.todo.id, result.todo)
            }
            break
          }

          case 'DELETE_TODO': {
            const result = await flow.execute(handleDeleteTodo, {
              id: message.payload.id,
              currentTodos: state.todos
            })

            if (result.success) {
              state.todos.delete(result.deletedId)
            }
            break
          }

          case 'GET_TODOS':
            break
        }
      }

      processing = false

      if (messageQueue.length > 0) {
        setImmediate(() => processNextMessage())
      }
    }

    controller.cleanup(async () => {
      while (messageQueue.length > 0) {
        await processNextMessage()
      }
    })

    return {
      send: (message: TenantMessage.Message) => {
        messageQueue.push(message)
        processNextMessage()
      },

      getState: () => state,

      getTodos: () => Array.from(state.todos.values())
    }
  })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: PASS

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add examples/multi-tenant-todo/actor.tenant.ts examples/multi-tenant-todo/actor.tenant.test.ts
git commit -m "refactor(examples): integrate flow handlers into tenant actor"
```

---

## Task 8: Main Example Application

**Files:**
- Create: `examples/multi-tenant-todo/main.ts`

**Step 1: Create main application**

Create `examples/multi-tenant-todo/main.ts`:

```typescript
import { createScope, Promised } from '@pumped-fn/core-next'
import { actorRegistry } from './resource.registry'

async function main() {
  console.log('Multi-Tenant Todo Actor System\n')

  const scope = createScope()
  const registry = await scope.resolve(actorRegistry)

  console.log('Spawning tenant actors...')
  const tenant1 = await registry.spawn('tenant-alice')
  const tenant2 = await registry.spawn('tenant-bob')

  console.log('Active tenants:', registry.list())
  console.log()

  console.log('Alice creates todos...')
  tenant1.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Buy groceries' }
  })

  tenant1.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-2', title: 'Write code' }
  })

  console.log('Bob creates todos...')
  tenant2.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Review PR' }
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('\nAlice todos:', tenant1.getTodos())
  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nAlice completes a todo...')
  tenant1.send({
    type: 'UPDATE_TODO',
    payload: { id: 'todo-1', completed: true }
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('Alice todos:', tenant1.getTodos())

  console.log('\nBob deletes a todo...')
  tenant2.send({
    type: 'DELETE_TODO',
    payload: { id: 'todo-1' }
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nCleaning up...')
  await scope.dispose()
  console.log('Done!')
}

Promised.try(main).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
```

**Step 2: Run the example**

Run: `pnpm -F @pumped-fn/examples dev:multi-tenant-todo`
Expected: Output showing multi-tenant todo operations

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add examples/multi-tenant-todo/main.ts
git commit -m "feat(examples): add multi-tenant todo main application"
```

---

## Task 9: Documentation

**Files:**
- Create: `examples/multi-tenant-todo/README.md`

**Step 1: Create README**

Create `examples/multi-tenant-todo/README.md`:

```markdown
# Multi-Tenant Todo Actor System

Example demonstrating actor pattern implementation with pumped-fn.

## Architecture

**Actors:**
- Each tenant is an isolated actor with encapsulated state
- Actors process messages sequentially via internal queue
- Message handlers are type-safe flows with discriminated unions

**Components:**
- `types.ts` - Type definitions for todos and messages
- `actor.tenant.ts` - Tenant actor resource with message queue
- `resource.registry.ts` - Actor supervisor managing tenant lifecycle
- `flow.message-handler.ts` - Flow-based message processing logic
- `main.ts` - Example usage

## Patterns Demonstrated

**Resource Pattern:**
- Tenant actors created via `provide()`
- Registry supervises actor lifecycle
- Proper cleanup with `controller.cleanup()`

**Flow Pattern:**
- Message handlers as reusable flows
- Discriminated union error handling
- Type-safe message validation

**Actor Pattern:**
- Isolated state per tenant
- Sequential message processing
- Message-based communication

## Running

```bash
# Run example
pnpm -F @pumped-fn/examples dev:multi-tenant-todo

# Run tests
pnpm -F @pumped-fn/examples test:multi-tenant-todo

# Type check
pnpm -F @pumped-fn/examples typecheck
```

## Key Features

- **Isolation:** Each tenant has completely isolated state
- **Type Safety:** All messages and handlers fully typed
- **Testability:** Flows can be tested independently
- **Cleanup:** Graceful shutdown drains message queues
- **Scalability:** Easy to add new message types as flows

## Testing Strategy

**Unit Tests:**
- Flow handlers tested independently with preset state
- Validation logic verified with edge cases

**Integration Tests:**
- Actor message processing with queue behavior
- Registry spawn/kill operations

**Manual Testing:**
- Run main.ts to see multi-tenant interaction
```

**Step 2: Commit**

```bash
git add examples/multi-tenant-todo/README.md
git commit -m "docs(examples): add multi-tenant todo README"
```

---

## Task 10: Final Verification

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/examples test:multi-tenant-todo`
Expected: All tests PASS

**Step 2: Full typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 3: Run the example**

Run: `pnpm -F @pumped-fn/examples dev:multi-tenant-todo`
Expected: Clean output showing multi-tenant operations

**Step 4: Verify file structure**

Run: `ls -la examples/multi-tenant-todo/`
Expected output:
```
actor.tenant.ts
actor.tenant.test.ts
flow.message-handler.ts
flow.message-handler.test.ts
main.ts
README.md
resource.registry.ts
resource.registry.test.ts
types.ts
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(examples): complete multi-tenant todo actor system

- Tenant actors with isolated state and message queues
- Type-safe flow-based message handlers
- Actor registry for supervision
- Comprehensive tests and documentation
- Demonstrates actor pattern with pumped-fn"
```

---

## Summary

**What was built:**
- Multi-tenant todo system using actor pattern
- 9 TypeScript files (5 implementation, 3 tests, 1 main)
- Type-safe message handling with discriminated unions
- Actor lifecycle management with proper cleanup
- Comprehensive test coverage

**Patterns demonstrated:**
- Resources for stateful actors (`provide()`)
- Flows for business logic (`flow()`)
- Discriminated unions for type safety
- Message-based communication
- Supervisor pattern with registry

**Testing:**
- Unit tests for flow handlers
- Integration tests for actor behavior
- Manual testing via main.ts

**Key learnings:**
- Actor pattern maps naturally to pumped-fn resources
- Flows provide type-safe message processing
- Registry pattern enables actor supervision
- Cleanup handlers ensure graceful shutdown
