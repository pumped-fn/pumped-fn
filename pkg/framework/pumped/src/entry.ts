import { controller, flow } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

/**
 * Generates the blessed edge wrapper for a shared flow: a flow that resolves
 * the target through a controller and delegates execution to it, forwarding
 * whatever input the caller provided.
 *
 * Replaces this hand-written pattern:
 * ```typescript
 * flow({
 *   name: "book",
 *   parse: typed<BookSpaceInput>(),
 *   tags: [pumped.command({ ... })],
 *   deps: { run: controller(bookSpace) },
 *   factory: (ctx, { run }) => run.exec({ input: ctx.input }),
 * })
 * ```
 * with:
 * ```typescript
 * entry(bookSpace, { name: "book", tags: [pumped.command({ ... })] })
 * ```
 *
 * `Lite.Flow`'s `parse` is only reliably readable at runtime when the target
 * declared a hand-written parse function; flows built with `typed<T>()`
 * store `parse: undefined` on the handle (the marker is stripped at
 * construction). Since parse can't be forwarded from the handle in general,
 * `entry` type-forwards the input shape via its own generics and installs an
 * identity parse (`(raw) => raw as TInput`) so the wrapper's `ctx.input` is
 * typed as the target's input and passed straight through to `run.exec`,
 * exactly as the hand-written `rawInput` would flow through unvalidated.
 *
 * The `as Lite.FlowExecOptions<TInput>` cast on the `run.exec` call is a
 * type-erased dispatch slot: `FlowExecArgs<TInput>` distributes over `TInput`
 * conditionally, and inside a generic function body TypeScript can't collapse
 * that to the concrete `{ input }` shape it collapses to at every call site's
 * instantiation.
 */
export function entry<TOutput, TInput, TFault>(
  target: Lite.Flow<TOutput, TInput, TFault>,
  meta: { name?: string; tags: Lite.Tagged<any>[] },
): Lite.Flow<TOutput, TInput, TFault> {
  return flow({
    name: meta.name ?? target.name,
    parse: (raw: unknown) => raw as TInput,
    tags: meta.tags,
    deps: { run: controller(target) },
    factory: (ctx, { run }) => run.exec({ input: ctx.input } as Lite.FlowExecOptions<TInput>),
  }) as Lite.Flow<TOutput, TInput, TFault>
}
