import type { Devtools } from "../types";

interface HttpTransportOptions {
  readonly url: string;
  readonly headers?: Record<string, string>;
}

export function httpTransport(options: HttpTransportOptions): Devtools.Transport {
  return {
    name: "http",
    send(events) {
      try {
        fetch(options.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...options.headers },
          body: JSON.stringify(events),
        }).catch(() => {});
      } catch {}
    },
  };
}
