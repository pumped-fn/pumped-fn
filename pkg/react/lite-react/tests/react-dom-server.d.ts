declare module 'react-dom/server' {
  import type { ReactNode } from 'react'
  export function renderToString(children: ReactNode): string
}

declare module 'react-dom/server.browser' {
  import type { ReactNode } from 'react'
  export interface ReactDOMServerReadableStream extends ReadableStream<Uint8Array> {
    allReady: Promise<void>
  }
  export function renderToReadableStream(
    children: ReactNode,
    options?: { signal?: AbortSignal; onError?: (error: unknown) => void }
  ): Promise<ReactDOMServerReadableStream>
}

declare module 'react-dom/client' {
  import type { ReactNode } from 'react'
  export interface Root {
    render(children: ReactNode): void
    unmount(): void
  }
  export function createRoot(container: Element | DocumentFragment): Root
  export function hydrateRoot(container: Element | Document, children: ReactNode): Root
}
