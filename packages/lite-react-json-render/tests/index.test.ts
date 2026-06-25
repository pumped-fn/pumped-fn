import { describe, expect, it } from 'vitest'
import { createScope } from '@pumped-fn/lite'
import { scopedValue } from '@pumped-fn/lite-react'
import type { StateStore } from '@json-render/core'
import { scopedValueStateStore } from '../src'

interface FormState {
  user: {
    name: string
    labels: string[]
    escaped: Record<string, string>
  }
}

interface AppState {
  ui: {
    count: number
  }
  auth: {
    token: string | null
  }
}

const form = scopedValue({
  name: 'json-render-form',
  initial: (): FormState => ({
    user: {
      name: 'Alice',
      labels: ['one'],
      escaped: {
        'a/b': 'slash',
        'tilde~key': 'tilde',
      },
    },
  }),
})

const app = scopedValue({
  name: 'json-render-app',
  initial: (): AppState => ({
    ui: {
      count: 1,
    },
    auth: {
      token: 'secret',
    },
  }),
})

describe('scopedValueStateStore', () => {
  it('adapts whole scopedValue access to json-render StateStore', async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const access = await form.resolve(ctx)
    const store = scopedValueStateStore({ value: access }) satisfies StateStore
    const calls: FormState[] = []
    const unsubscribe = store.subscribe(() => {
      calls.push(access.getSnapshot())
    })

    expect(store.get('/user/name')).toBe('Alice')
    expect(store.get('/user/labels/0')).toBe('one')
    expect(store.get('/user/escaped/a~1b')).toBe('slash')
    expect(store.get('/user/escaped/tilde~0key')).toBe('tilde')
    expect(store.getSnapshot()).toBe(access.getSnapshot())
    expect(store.getServerSnapshot?.()).toBe(access.getSnapshot())

    store.set('/user/name', 'Bob')
    store.set('/user/name', 'Bob')
    store.update({
      '/user/labels/1': 'two',
      '/user/escaped/a~1b': 'changed',
    })

    expect(access.getSnapshot()).toEqual({
      user: {
        name: 'Bob',
        labels: ['one', 'two'],
        escaped: {
          'a/b': 'changed',
          'tilde~key': 'tilde',
        },
      },
    })
    expect(calls).toHaveLength(2)

    unsubscribe()
    store.set('/user/name', 'Cara')
    expect(calls).toHaveLength(2)

    await ctx.close()
    await scope.dispose()
  })

  it('adapts a selected nested slice with an explicit updater', async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const access = await app.resolve(ctx)
    const store = scopedValueStateStore({
      value: access,
      selector: (state) => state.ui,
      updater: (next, value) => value.set({ ...value.getSnapshot(), ui: next as AppState['ui'] }),
    })

    expect(store.get('/count')).toBe(1)
    store.set('/count', 2)

    expect(access.getSnapshot()).toEqual({
      ui: {
        count: 2,
      },
      auth: {
        token: 'secret',
      },
    })

    await ctx.close()
    await scope.dispose()
  })
})
