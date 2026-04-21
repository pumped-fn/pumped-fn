import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { atom, createScope } from '@pumped-fn/lite'
import { observer } from '@legendapp/state/react'
import { ScopeProvider, useAtomObs } from '../src'

describe('diag: per-key tracking', () => {
  it('renders initial value and re-renders on key mutation', async () => {
    const a = atom<{ n: number; m: number }>({ factory: () => ({ n: 0, m: 100 }) })
    const scope = createScope()
    await scope.resolve(a)

    let renders = 0
    const C = observer(() => {
      renders++
      const obs = useAtomObs(a)
      // eslint-disable-next-line no-console
      console.log('render', renders, 'obs.n.get=', obs.n.get(), 'obs.m.get=', obs.m.get())
      return <div data-testid="v">{obs.n.get()}-{obs.m.get()}</div>
    })

    render(
      <ScopeProvider scope={scope}>
        <C />
      </ScopeProvider>
    )

    // eslint-disable-next-line no-console
    console.log('after initial render, renders=', renders, 'text=', screen.queryByTestId('v')?.textContent)
    expect(renders).toBeGreaterThan(0)
    expect(screen.getByTestId('v').textContent).toBe('0-100')

    const firstCount = renders
    await act(async () => {
      scope.controller(a).set({ n: 1, m: 100 })
      await Promise.resolve()
    })
    // eslint-disable-next-line no-console
    console.log('after mutate, renders=', renders, 'text=', screen.queryByTestId('v')?.textContent)
    expect(screen.getByTestId('v').textContent).toBe('1-100')
    expect(renders).toBeGreaterThan(firstCount)
  })
})
