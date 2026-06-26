import { Fragment, useCallback, useEffect, useRef, type ComponentType, type ReactNode } from "react"
import type { Lite } from "@pumped-fn/lite"
import { useFlow, useScopedValue, type ScopedValue } from "@pumped-fn/lite-react"
import {
  isRepeatingSlot,
  readPath,
  resolveExpr,
  verifySpec,
  type JsonAction,
  type JsonNode,
  type JsonSpec,
  type RenderActionInput,
  type ValueKind,
  type VerifyContext,
} from "@pumped-fn/lite-render-core"

/** The TypeScript value a resolved prop/event field carries for a given catalog {@link ValueKind}. */
type ValueForKind<K extends ValueKind> =
  K extends "string" ? string :
    K extends "number" ? number :
      K extends "boolean" ? boolean :
        K extends "nullableString" ? string | null :
          K extends "array" ? readonly unknown[] :
            K extends "object" ? Record<string, unknown> :
              never

/** A catalog component as the renderer reads it: prop kinds, slot specs, event payload kinds, capabilities. */
type RenderCatalogComponent = {
  props: Record<string, ValueKind>
  slots: Record<string, true | { repeats: string }>
  events: Record<string, Record<string, ValueKind>>
  capabilities: readonly string[]
}
type RenderCatalog = Record<string, RenderCatalogComponent>

/** The kind-typed event payload a component's `on` handler receives, mirroring the catalog event shape. */
type EventPayload<Shape extends Record<string, ValueKind>> = { [F in keyof Shape]: ValueForKind<Shape[F]> }

/**
 * The props the renderer passes to a catalog component's React implementation: each declared prop resolved to its
 * kind-typed value, each slot lowered to rendered children, each event lowered to a Lite-flow dispatcher.
 */
type NodeRenderProps<Comp extends RenderCatalogComponent> = {
  readonly props: { [P in keyof Comp["props"]]: ValueForKind<Comp["props"][P]> }
  readonly slots: { [S in keyof Comp["slots"]]: ReactNode[] }
  readonly on: { [E in keyof Comp["events"]]: (event: EventPayload<Comp["events"][E]>) => void }
}

/** The catalog-component-name to React-implementation map, type-checked against the catalog's declared prop kinds. */
type ComponentMap<C extends RenderCatalog> = { [N in keyof C]: ComponentType<NodeRenderProps<C[N]>> }

/**
 * Binds a React implementation to every catalog component. The impl map cannot drift from the catalog: an
 * implementation whose props expect a kind other than the catalog declares fails to type-check here.
 */
function defineComponents<const C extends RenderCatalog>(_catalog: C, components: ComponentMap<C>): ComponentMap<C> {
  return components
}

type ErasedNodeProps = {
  props: Record<string, unknown>
  slots: Record<string, ReactNode[]>
  on: Record<string, (event?: Record<string, unknown>) => void>
}

type RenderEnv = {
  components: Record<string, ComponentType<ErasedNodeProps>>
  catalog: VerifyContext["components"]
  execute: (action: JsonAction, item?: Record<string, unknown>, event?: Record<string, unknown>) => void
}

const verifiedSpecs = new WeakMap<JsonSpec, JsonSpec>()

function verifyCached(spec: JsonSpec, context: VerifyContext): JsonSpec {
  const cached = verifiedSpecs.get(spec)
  if (cached) return cached
  const result = verifySpec(spec, context)
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join("\n"))
  verifiedSpecs.set(spec, result.spec)
  return result.spec
}

function collectWatches(node: JsonNode, out: [string, JsonAction][]): void {
  if (node.watch) for (const entry of Object.entries(node.watch)) out.push(entry)
  for (const children of Object.values(node.slots ?? {})) for (const child of children) collectWatches(child, out)
}

function useWatchEffects(root: JsonNode, state: unknown, execute: (action: JsonAction) => void): void {
  const previous = useRef<Map<number, unknown>>(new Map())
  useEffect(() => {
    const watches: [string, JsonAction][] = []
    collectWatches(root, watches)
    const snapshot = new Map<string, unknown>()
    for (const [path] of watches) if (!snapshot.has(path)) snapshot.set(path, readPath(state, path))
    const seen = previous.current
    watches.forEach(([path, action], entry) => {
      const current = snapshot.get(path)
      if (!seen.has(entry)) {
        seen.set(entry, current)
        return
      }
      if (seen.get(entry) === current) return
      seen.set(entry, current)
      execute(action)
    })
  })
}

function renderNode(
  node: JsonNode,
  env: RenderEnv,
  state: unknown,
  item: Record<string, unknown> | undefined
): ReactNode {
  if (node.visible) {
    const actual = readPath(state, node.visible.state)
    if (node.visible.eq !== undefined && actual !== node.visible.eq) return null
    if (node.visible.eq === undefined && !actual) return null
  }

  const Impl = env.components[node.type]!
  const schema = env.catalog[node.type]!

  const props: Record<string, unknown> = {}
  for (const [name, expr] of Object.entries(node.props)) props[name] = resolveExpr(expr, state, item)

  const slots: Record<string, ReactNode[]> = {}
  for (const [slotName, children] of Object.entries(node.slots ?? {})) {
    const slotSpec = schema.slots[slotName]
    if (slotSpec !== undefined && isRepeatingSlot(slotSpec)) {
      const source = resolveExpr(node.props[slotSpec.repeats]!, state, item) as Record<string, unknown>[]
      slots[slotName] = source.flatMap((element, elementIndex) =>
        children.map((child, childIndex) => (
          <Fragment key={`${slotName}:${elementIndex}:${childIndex}`}>{renderNode(child, env, state, element)}</Fragment>
        ))
      )
    } else {
      slots[slotName] = children.map((child, childIndex) => (
        <Fragment key={`${slotName}:${childIndex}`}>{renderNode(child, env, state, item)}</Fragment>
      ))
    }
  }

  const on: Record<string, (event?: Record<string, unknown>) => void> = {}
  for (const [eventName, action] of Object.entries(node.on ?? {})) {
    on[eventName] = (event) => env.execute(action, item, event)
  }

  return <Impl props={props} slots={slots} on={on} />
}

type JsonRenderProps<C extends RenderCatalog, State> = {
  readonly spec: JsonSpec
  readonly context: VerifyContext
  readonly components: ComponentMap<C>
  readonly state: ScopedValue<State>
  readonly dispatch: Lite.Flow<unknown, RenderActionInput>
}

/**
 * Lowers a core-verified spec to React over a Lite scope. The spec is verified lazily at render time (cached by
 * identity); state is read reactively from the Lite resource; `on`/`watch` actions dispatch through the supplied
 * Lite flow. All durable state and async stay in Lite; this component only observes and dispatches.
 */
function JsonRender<const C extends RenderCatalog, State>(props: JsonRenderProps<C, State>): ReactNode {
  const spec = verifyCached(props.spec, props.context)
  const view = useScopedValue(props.state)
  const { execute: runAction } = useFlow(props.dispatch)
  const execute = useCallback(
    (action: JsonAction, item?: Record<string, unknown>, event?: Record<string, unknown>) => {
      const input: RenderActionInput = { action }
      if (item !== undefined) input.item = item
      if (event !== undefined) input.event = event
      runAction(input)
    },
    [runAction]
  )
  useWatchEffects(spec.root, view.snapshot, execute)
  const env: RenderEnv = {
    components: props.components as unknown as Record<string, ComponentType<ErasedNodeProps>>,
    catalog: props.context.components,
    execute,
  }
  return <Fragment>{renderNode(spec.root, env, view.snapshot, undefined)}</Fragment>
}

export { JsonRender, defineComponents }
export type {
  JsonRenderProps,
  ComponentMap,
  NodeRenderProps,
  EventPayload,
  ValueForKind,
  RenderCatalog,
  RenderCatalogComponent,
}
