import type { Devtools } from "../types";

interface HttpTransportOptions {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

/**
 * Creates an HTTP transport for cross-process event streaming.
 * Fire-and-forget - errors are silently dropped.
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
