import { render } from '@testing-library/react'
import { act, Suspense } from 'react'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { atom, createScope, ScopeProvider, useAtom, useController } from '../src'

describe('lite-react browser mode', () => {
  it('updates atom state through real browser interactions', async () => {
    const countAtom = atom({ factory: () => 0 })
    const scope = createScope()
    await scope.resolve(countAtom)

    function Counter() {
      const count = useAtom(countAtom)
      const ctrl = useController(countAtom)

      return (
        <div>
          <output data-testid="count">{count}</output>
          <button onClick={() => ctrl.set(count + 1)}>Increment</button>
        </div>
      )
    }

    try {
      render(
        <ScopeProvider scope={scope}>
          <Counter />
        </ScopeProvider>
      )

      await expect.element(page.getByTestId('count')).toHaveTextContent('0')
      await act(async () => {
        await userEvent.click(page.getByRole('button', { name: 'Increment' }))
        await scope.flush()
      })
      await expect.element(page.getByTestId('count')).toHaveTextContent('1')
    } finally {
      await scope.dispose()
    }
  })

  it('resolves suspenseful atoms in browser mode', async () => {
    let resolveValue!: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolveValue = resolve
    })
    const valueAtom = atom({
      factory: async () => promise,
    })

    const scope = createScope()

    function View() {
      const value = useAtom(valueAtom)
      return <div data-testid="value">{value}</div>
    }

    try {
      render(
        <ScopeProvider scope={scope}>
          <Suspense fallback={<div>Loading...</div>}>
            <View />
          </Suspense>
        </ScopeProvider>
      )

      await expect.element(page.getByText('Loading...')).toBeInTheDocument()
      await act(async () => {
        resolveValue('resolved in browser')
        await promise
      })
      await expect.element(page.getByTestId('value')).toHaveTextContent('resolved in browser')
    } finally {
      await scope.dispose()
    }
  })
})
