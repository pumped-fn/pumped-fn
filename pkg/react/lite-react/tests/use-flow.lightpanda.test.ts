import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Plugin, type ViteDevServer } from 'vite'

interface LightpandaProcess {
  child: ChildProcessWithoutNullStreams
  endpoint: string
}

interface FlowPageState {
  text: string | null
  success: string | null
  settle: string | null
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let activeServer: ViteDevServer | null = null
let activeBrowser: Browser | null = null
let activeLightpanda: ChildProcessWithoutNullStreams | null = null

afterEach(async () => {
  await activeBrowser?.close()
  activeBrowser = null
  activeLightpanda?.kill()
  activeLightpanda = null
  await activeServer?.close()
  activeServer = null
})

describe('useFlow with Lightpanda', () => {
  it('renders through Vite and executes a flow from a real browser click', async () => {
    activeServer = await startVite()
    const browser = await startBrowser()
    activeBrowser = browser
    const page = await browser.newPage()
    await page.goto(serverUrl(activeServer), { waitUntil: 'load', timeout: 10000 })

    expect(await readState(page)).toEqual({ text: 'idle:none', success: null, settle: null })
    await page.click('#save')

    await waitForState(page, {
      text: 'success:saved:lightpanda',
      success: 'saved:lightpanda',
      settle: 'success',
    })
  })
})

async function startVite(): Promise<ViteDevServer> {
  const server = await createServer({
    root: packageRoot,
    configFile: false,
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 0,
    },
    plugins: [lightpandaSmokePlugin()],
  })
  await server.listen()
  return server
}

function lightpandaSmokePlugin(): Plugin {
  return {
    name: 'lightpanda-use-flow-smoke',
    resolveId(id) {
      if (id === 'virtual:lightpanda-use-flow') return '\0virtual:lightpanda-use-flow.tsx'
      return null
    },
    load(id) {
      if (id === '\0virtual:lightpanda-use-flow.tsx') return smokeSource
      return null
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/') {
          next()
          return
        }
        const html = await server.transformIndexHtml('/', [
          '<!doctype html>',
          '<html>',
          '<head><title>lite-react Lightpanda smoke</title></head>',
          '<body><div id="root"></div><script type="module">import "virtual:lightpanda-use-flow"</script></body>',
          '</html>',
        ].join(''))
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/html')
        response.end(html)
      })
    },
  }
}

async function startBrowser(): Promise<Browser> {
  const lightpanda = await startLightpanda()
  activeLightpanda = lightpanda.child
  return chromium.connectOverCDP(lightpanda.endpoint)
}

async function startLightpanda(): Promise<LightpandaProcess> {
  const port = await getOpenPort()
  const child = spawn(getLightpandaExecutable(), [
    'serve',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--log-level',
    'error',
  ])
  return { child, endpoint: await waitForLightpanda(port) }
}

function getLightpandaExecutable(): string {
  const executablePath = process.env['LIGHTPANDA_EXECUTABLE_PATH']
  if (executablePath) return executablePath
  const cached = `${homedir()}/.cache/lightpanda-node/lightpanda`
  return existsSync(cached) ? cached : 'lightpanda'
}

function getOpenPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Unable to allocate a TCP port.'))
        return
      }
      server.close(() => resolvePort(address.port))
    })
  })
}

async function waitForLightpanda(port: number): Promise<string> {
  const url = `http://127.0.0.1:${port}/json/version`
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => null)
    if (response?.ok) {
      const version = await response.json() as { webSocketDebuggerUrl?: string }
      if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  throw new Error(`Lightpanda did not expose a CDP endpoint at ${url}.`)
}

function serverUrl(server: ViteDevServer): string {
  const address = server.httpServer?.address()
  if (address === null || address === undefined || typeof address === 'string') throw new Error('Vite did not expose a TCP server address.')
  return `http://127.0.0.1:${address.port}/`
}

function readState(page: Page): Promise<FlowPageState> {
  return page.evaluate(() => ({
    text: document.querySelector('#save')?.textContent ?? null,
    success: document.body.getAttribute('data-success'),
    settle: document.body.getAttribute('data-settle'),
  }))
}

async function waitForState(page: Page, expected: FlowPageState): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const state = await readState(page)
    if (state.text === expected.text && state.success === expected.success && state.settle === expected.settle) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50))
  }
  expect(await readState(page)).toEqual(expected)
}

const smokeSource = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { createScope, flow } from '@pumped-fn/lite'
import { ExecutionContextContext } from '/src/context.tsx'
import { useFlow } from '/src/hooks.ts'

const save = flow({
  name: 'lightpanda-save',
  parse: (raw) => String(raw),
  factory: (ctx) => 'saved:' + ctx.input,
})

function SaveButton() {
  const action = useFlow(save, {
    onSuccess: (data) => {
      document.body.setAttribute('data-success', data)
    },
    onSettle: (result) => {
      document.body.setAttribute('data-settle', result.status)
    },
  })
  return React.createElement(
    'button',
    { id: 'save', type: 'button', onClick: () => action.execute('lightpanda') },
    action.status + ':' + (action.data ?? action.error?.message ?? 'none'),
  )
}

const ctx = createScope().createContext()

createRoot(document.getElementById('root')).render(
  React.createElement(ExecutionContextContext.Provider, { value: ctx }, React.createElement(SaveButton)),
)
`
