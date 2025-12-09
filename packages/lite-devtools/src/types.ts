export namespace Devtools {
  export type EventType =
    | "atom:resolve"
    | "atom:resolved"
    | "flow:exec"
    | "flow:complete"
    | "error";

  export interface Event {
    readonly id: string;
    readonly type: EventType;
    readonly timestamp: number;
    readonly name: string;
    readonly duration?: number;
    readonly deps?: readonly string[];
    readonly input?: unknown;
    readonly error?: ErrorInfo;
  }

  export interface ErrorInfo {
    readonly message: string;
    readonly stack?: string;
  }

  export interface Transport {
    readonly name: string;
    send(events: readonly Event[]): void;
    dispose?(): void;
  }

  export interface MemoryTransport extends Transport {
    subscribe(callback: (events: readonly Event[]) => void): () => void;
  }

  export interface Options {
    readonly transports?: readonly Transport[];
    readonly maxQueueSize?: number;
    readonly serialize?: (event: Event) => unknown;
  }
}
