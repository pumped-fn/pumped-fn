import type { Devtools } from "../types";

interface ConsoleOptions {
  readonly format?: "pretty" | "json" | "compact";
}

const ICONS: Record<Devtools.EventType, string> = {
  "atom:resolve": "\u26A1",
  "atom:resolved": "\u2713",
  "flow:exec": "\u25B6",
  "flow:complete": "\u2713",
  error: "\u2717",
};

function formatPretty(event: Devtools.Event): string {
  const time = new Date(event.timestamp).toISOString().slice(11, 23);
  const icon = ICONS[event.type];
  const duration = event.duration ? ` (${event.duration.toFixed(1)}ms)` : "";
  const deps =
    event.deps && event.deps.length > 0 ? ` deps:[${event.deps.join(",")}]` : "";

  return `[${time}] ${icon} ${event.type.padEnd(14)} ${event.name}${duration}${deps}`;
}

function formatCompact(event: Devtools.Event): string {
  const duration = event.duration ? ` ${event.duration.toFixed(0)}ms` : "";
  return `${ICONS[event.type]} ${event.name}${duration}`;
}

/**
 * Creates a console transport for debugging.
 *
 * @param options - Formatting options
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   extensions: [createDevtools({ transports: [console({ format: 'pretty' })] })]
 * })
 * ```
 */
export function consoleTransport(options?: ConsoleOptions): Devtools.Transport {
  const format = options?.format ?? "pretty";

  return {
    name: "console",

    send(events) {
      for (const event of events) {
        try {
          switch (format) {
            case "json":
              globalThis.console.log(JSON.stringify(event));
              break;
            case "compact":
              globalThis.console.log(formatCompact(event));
              break;
            case "pretty":
            default:
              globalThis.console.log(formatPretty(event));
              break;
          }
        } catch {
          /* silently ignore console errors */
        }
      }
    },
  };
}
