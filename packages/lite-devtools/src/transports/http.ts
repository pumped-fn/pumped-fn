import type { Devtools } from "../types";

/**
 * Options for the HTTP transport.
 * @internal
 */
interface HttpTransportOptions {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

/**
 * Creates an HTTP transport for cross-process event streaming.
 * Events are sent via POST to the specified URL. Fire-and-forget - errors are silently dropped.
 *
 * @param options - Transport configuration
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   extensions: [createDevtools({ transports: [httpTransport({ url: 'http://localhost:3001/events' })] })]
 * })
 * ```
 */
export function httpTransport(options: HttpTransportOptions): Devtools.Transport {
  return {
    name: "http",
    send(events) {
      void fetch(options.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...options.headers },
        body: JSON.stringify(events),
      }).catch(() => {});
    },
  };
}
