import type { Devtools } from "../types";

const DEFAULT_CHANNEL = "pumped-devtools";

/**
 * Creates a BroadcastChannel transport for same-origin browser tabs.
 *
 * @param channel - Channel name (default: 'pumped-devtools')
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   extensions: [createDevtools({ transports: [broadcastChannel()] })]
 * })
 * ```
 */
export function broadcastChannel(channel?: string): Devtools.Transport {
  if (typeof BroadcastChannel === "undefined") {
    return {
      name: "broadcast-channel",
      send() {},
    };
  }

  const bc = new BroadcastChannel(channel ?? DEFAULT_CHANNEL);

  return {
    name: "broadcast-channel",

    send(events) {
      try {
        bc.postMessage(events);
      } catch {}
    },

    dispose() {
      bc.close();
    },
  };
}

/**
 * Creates a BroadcastChannel receiver for consuming events in another tab.
 *
 * @param channel - Channel name (default: 'pumped-devtools')
 *
 * @example
 * ```typescript
 * const unsubscribe = receiveBroadcast((events) => {
 *   console.log('Received:', events)
 * })
 * ```
 */
export function receiveBroadcast(
  callback: (events: readonly Devtools.Event[]) => void,
  channel?: string
): () => void {
  if (typeof BroadcastChannel === "undefined") {
    return () => {};
  }

  const bc = new BroadcastChannel(channel ?? DEFAULT_CHANNEL);

  bc.onmessage = (event: MessageEvent<readonly Devtools.Event[]>) => {
    try {
      callback(event.data);
    } catch {}
  };

  return () => {
    bc.close();
  };
}
