import type { Devtools } from "../types";
import { memoryTransportSymbol } from "../symbols";

interface MemoryTransportImpl extends Devtools.MemoryTransport {
  readonly [memoryTransportSymbol]: true;
}

/**
 * Creates an in-process memory transport for same-page panels and testing.
 *
 * @example
 * ```typescript
 * const mem = memory()
 * mem.subscribe((events) => {
 *   console.log('Received events:', events)
 * })
 * ```
 */
export function memory(): Devtools.MemoryTransport {
  const listeners = new Set<(events: readonly Devtools.Event[]) => void>();

  const transport: MemoryTransportImpl = {
    [memoryTransportSymbol]: true,
    name: "memory",

    send(events) {
      for (const listener of listeners) {
        try {
          listener(events);
        } catch {
          /* silently ignore listener errors */
        }
      }
    },

    subscribe(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    dispose() {
      listeners.clear();
    },
  };

  return transport;
}

/**
 * Type guard for MemoryTransport.
 */
export function isMemoryTransport(
  value: unknown
): value is Devtools.MemoryTransport {
  return (
    typeof value === "object" &&
    value !== null &&
    memoryTransportSymbol in value
  );
}
