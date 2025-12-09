import type { Lite } from "@pumped-fn/lite";
import type { Devtools } from "./types";

const DEFAULT_MAX_QUEUE_SIZE = 1000;

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getAtomName(atom: Lite.Atom<unknown>): string {
  return atom.factory.name ?? "<anonymous>";
}

function getAtomDeps(atom: Lite.Atom<unknown>): string[] {
  if (!atom.deps) return [];
  return Object.keys(atom.deps);
}

function getTargetName(target: { name?: string } | ((...args: never[]) => unknown)): string {
  if ("name" in target && typeof target.name === "string") {
    return target.name || "<anonymous>";
  }
  return "<fn>";
}

/**
 * Creates a devtools extension for observability.
 *
 * @example
 * ```typescript
 * import { createDevtools, memory } from '@pumped-fn/lite-devtools'
 * import { createScope } from '@pumped-fn/lite'
 *
 * const mem = memory()
 * const scope = createScope({
 *   extensions: [createDevtools({ transports: [mem] })]
 * })
 *
 * mem.subscribe((events) => console.log(events))
 * ```
 */
export function createDevtools(options?: Devtools.Options): Lite.Extension {
  const transports = options?.transports ?? [];
  const maxQueueSize = options?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
  const serialize = options?.serialize;

  let queue: Devtools.Event[] = [];
  let scheduled = false;

  function emit(event: Devtools.Event): void {
    queue.push(event);

    if (queue.length > maxQueueSize) {
      queue.shift();
    }

    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => {
        const batch = queue;
        queue = [];
        scheduled = false;

        const toSend = serialize ? batch.map(serialize) : batch;

        for (const transport of transports) {
          try {
            transport.send(toSend as Devtools.Event[]);
          } catch {}
        }
      });
    }
  }

  return {
    name: "devtools",

    wrapResolve: async (next, atom, _scope) => {
      const id = generateId();
      const name = getAtomName(atom);
      const deps = getAtomDeps(atom);

      emit({
        id,
        type: "atom:resolve",
        timestamp: Date.now(),
        name,
        deps,
      });

      const start = performance.now();
      try {
        const result = await next();
        emit({
          id,
          type: "atom:resolved",
          timestamp: Date.now(),
          name,
          deps,
          duration: performance.now() - start,
        });
        return result;
      } catch (err) {
        emit({
          id,
          type: "error",
          timestamp: Date.now(),
          name,
          error: {
            message: String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
        });
        throw err;
      }
    },

    wrapExec: async (next, target, ctx) => {
      const id = generateId();
      const name = getTargetName(target);

      emit({
        id,
        type: "flow:exec",
        timestamp: Date.now(),
        name,
        input: ctx.input,
      });

      const start = performance.now();
      try {
        const result = await next();
        emit({
          id,
          type: "flow:complete",
          timestamp: Date.now(),
          name,
          duration: performance.now() - start,
        });
        return result;
      } catch (err) {
        emit({
          id,
          type: "error",
          timestamp: Date.now(),
          name,
          error: {
            message: String(err),
            stack: err instanceof Error ? err.stack : undefined,
          },
        });
        throw err;
      }
    },

    dispose: () => {
      for (const transport of transports) {
        try {
          transport.dispose?.();
        } catch {}
      }
    },
  };
}
