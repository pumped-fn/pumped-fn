import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { renderToReadableStream } from 'react-dom/server.browser'
import { hydrateRoot } from 'react-dom/client'
import { act, Suspense } from 'react'
import { atom, createScope, resource, ExecutionContextProvider, ScopeProvider, useAtom, useExecutionContext, useResource, useSelect, type Lite } from '../src'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Dev-only artifact of using react-dom/server.browser and react-dom/client in
// the same process; real SSR renders server and client in separate processes.
const DUAL_RENDERER_WARNING = 'Detected multiple renderers concurrently rendering the same context provider'

function captureConsoleErrors(): { errors: string[]; restore: () => void } {
  const errors: string[] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    const message = String(args[0])
    if (message.includes(DUAL_RENDERER_WARNING)) return
    errors.push(message)
  })
  return { errors, restore: () => spy.mockRestore() }
}

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let html = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return html
    html += decoder.decode(value, { stream: true })
  }
}

describe('SSR', () => {
  it('renderToString renders resolved atoms through useAtom and useSelect', async () => {
    const scope = createScope()
    const a = atom({ factory: () => ({ name: 'server', hits: 3 }) })
    await scope.resolve(a)

    function Reader() {
      const v = useAtom(a)
      const hits = useSelect(a, (x) => x.hits)
      return <div>{v.name}:{hits}</div>
    }

    const html = renderToString(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<span>loading</span>}>
          <Reader />
        </Suspense>
      </ScopeProvider>
    )
    expect(html).toContain('server')
    expect(html).toContain('3')
  })

  it('managed ExecutionContextProvider renders children on the server', () => {
    const scope = createScope()

    function Probe() {
      useExecutionContext()
      return <div>inside-ctx</div>
    }

    const html = renderToString(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <Probe />
        </ExecutionContextProvider>
      </ScopeProvider>
    )
    expect(html).toContain('inside-ctx')
  })

  it('streaming SSR resolves resources under a managed provider', async () => {
    const scope = createScope()
    const r = resource({ factory: () => 'res-value' })

    function Reader() {
      const v = useResource(r)
      return <div>{v}</div>
    }

    const stream = await renderToReadableStream(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <Suspense fallback={<span>loading</span>}>
            <Reader />
          </Suspense>
        </ExecutionContextProvider>
      </ScopeProvider>
    )
    await stream.allReady
    const html = await streamToString(stream)
    expect(html).toContain('res-value')
  })

  it('streaming SSR resolves idle async atoms and emits final content', async () => {
    const scope = createScope()
    const a = atom({
      factory: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        return 'streamed-value'
      },
    })

    function Reader() {
      const v = useAtom(a)
      return <div>{v}</div>
    }

    const stream = await renderToReadableStream(
      <ScopeProvider scope={scope}>
        <Suspense fallback={<span>loading</span>}>
          <Reader />
        </Suspense>
      </ScopeProvider>
    )
    await stream.allReady
    const html = await streamToString(stream)
    expect(html).toContain('streamed-value')
  })

  it('hydration of server HTML produces no mismatch errors', async () => {
    const scope = createScope()
    const a = atom({ factory: () => 'same-value' })
    await scope.resolve(a)

    function Reader() {
      const v = useAtom(a)
      return <div>{v}</div>
    }
    const app = (
      <ScopeProvider scope={scope}>
        <Suspense fallback={<span>loading</span>}>
          <Reader />
        </Suspense>
      </ScopeProvider>
    )

    const html = renderToString(app)
    const container = document.createElement('div')
    container.innerHTML = html

    const { errors, restore } = captureConsoleErrors()
    await act(async () => {
      hydrateRoot(container, app)
    })
    restore()
    expect(errors).toEqual([])
    expect(container.textContent).toBe('same-value')
  })

  it('managed ExecutionContextProvider hydrates streamed HTML cleanly', async () => {
    const serverScope = createScope()
    const r = resource({ factory: () => 'hydrated-res' })

    function Reader() {
      const v = useResource(r)
      return <div>{v}</div>
    }
    const app = (scope: Lite.Scope) => (
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <Suspense fallback={<span>loading</span>}>
            <Reader />
          </Suspense>
        </ExecutionContextProvider>
      </ScopeProvider>
    )

    const stream = await renderToReadableStream(app(serverScope))
    await stream.allReady
    const html = await streamToString(stream)
    expect(html).toContain('hydrated-res')

    const container = document.createElement('div')
    container.innerHTML = html

    const { errors, restore } = captureConsoleErrors()
    const clientScope = createScope()
    await act(async () => {
      hydrateRoot(container, app(clientScope))
    })
    restore()
    expect(errors).toEqual([])
    expect(container.textContent).toBe('hydrated-res')
  })

  it('non-suspense useAtom reports loading on the server when resolve requested', async () => {
    const scope = createScope()
    const a = atom({ factory: async () => 'late' })

    function Reader() {
      const s = useAtom(a, { suspense: false, resolve: true })
      return <div>{s.loading ? 'loading' : String(s.data)}</div>
    }

    const html = renderToString(
      <ScopeProvider scope={scope}>
        <Reader />
      </ScopeProvider>
    )
    expect(html).toContain('loading')
  })
})
