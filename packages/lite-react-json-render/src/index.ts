import { createStoreAdapter } from '@json-render/core/store-utils'
import type { ActionHandler, StateModel, StateStore } from '@json-render/core'
import { useExecutionContext } from '@pumped-fn/lite-react'
import type { Lite, ScopedValueAccess } from '@pumped-fn/lite-react'
import { useRef } from 'react'

type ScopedValueStateSource<State extends object> = Pick<ScopedValueAccess<State>, 'getSnapshot' | 'set' | 'subscribe'>
type JsonRenderActionParams = Record<string, unknown>
type FlowActionHandlerResult<Target> =
  Target extends Lite.Flow<infer Output, any>
    ? Output
    : Target extends FlowActionOptions<infer Flow>
      ? Lite.Utils.FlowOutput<Flow>
      : never
type FlowActionHandlers<Actions extends FlowActionTargets> = {
  [Name in keyof Actions]: ActionHandler<JsonRenderActionParams, FlowActionHandlerResult<Actions[Name]>>
}
type FlowActionTargets = Record<string, FlowActionTarget<Lite.Flow<any, any>>>
type FlowActionTarget<Flow extends Lite.Flow<any, any>> = Flow | FlowActionOptions<Flow>

interface ScopedValueStateStoreOptions<State extends object = StateModel> {
  value: ScopedValueStateSource<State>
}

interface ScopedValueStateStoreSliceOptions<State extends object> {
  value: ScopedValueStateSource<State>
  selector(state: State): StateModel
  updater(nextState: StateModel, value: ScopedValueStateSource<State>): void
}

interface FlowActionBaseOptions<Flow extends Lite.Flow<any, any>> {
  flow: Flow
  name?: string
  tags?: Lite.Tagged<any>[]
}

interface FlowActionInputOptions<Flow extends Lite.Flow<any, any>> extends FlowActionBaseOptions<Flow> {
  input(params: JsonRenderActionParams): Lite.Utils.FlowInput<Flow>
  rawInput?: never
}

interface FlowActionRawInputOptions<Flow extends Lite.Flow<any, any>> extends FlowActionBaseOptions<Flow> {
  rawInput?(params: JsonRenderActionParams): unknown
  input?: never
}

type FlowActionOptions<Flow extends Lite.Flow<any, any>> =
  | FlowActionInputOptions<Flow>
  | FlowActionRawInputOptions<Flow>

interface FlowActionHandlersOptions<Actions extends FlowActionTargets> {
  ctx: Lite.ExecutionContext
  actions: Actions
}

interface FlowActionHandlerCell {
  ctx: Lite.ExecutionContext
  target: FlowActionTarget<Lite.Flow<any, any>>
}

interface FlowActionHandlersRef {
  handlers: Record<string, ActionHandler<JsonRenderActionParams, unknown>>
  cells: Map<string, FlowActionHandlerCell>
}

function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreOptions<State>
): StateStore
function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreSliceOptions<State>
): StateStore
function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreOptions<State> | ScopedValueStateStoreSliceOptions<State>
): StateStore {
  const source = options.value
  const selector: (state: State) => StateModel = 'selector' in options
    ? options.selector
    : (state) => state as unknown as StateModel
  const updater: (next: StateModel, value: ScopedValueStateSource<State>) => void = 'updater' in options
    ? options.updater
    : (next, value) => value.set(next as unknown as State)

  return createStoreAdapter({
    getSnapshot: () => selector(source.getSnapshot()),
    setSnapshot: (next) => updater(next, source),
    subscribe(listener) {
      let prev = selector(source.getSnapshot())
      return source.subscribe(() => {
        const current = selector(source.getSnapshot())
        if (current !== prev) {
          prev = current
          listener()
          prev = selector(source.getSnapshot())
        }
      })
    },
  })
}

function flowAction<Flow extends Lite.Flow<any, any>>(options: FlowActionOptions<Flow>): FlowActionOptions<Flow> {
  return options
}

function flowActionHandlers<const Actions extends FlowActionTargets>(
  options: FlowActionHandlersOptions<Actions>
): FlowActionHandlers<Actions> {
  return Object.fromEntries(
    Object.entries(options.actions).map(([name, target]) => [
      name,
      flowActionHandler(options.ctx, target),
    ])
  ) as FlowActionHandlers<Actions>
}

function useFlowActionHandlers<const Actions extends FlowActionTargets>(
  actions: Actions
): FlowActionHandlers<Actions> {
  const ctx = useExecutionContext()
  const ref = useRef<FlowActionHandlersRef | null>(null)
  if (!ref.current) {
    ref.current = {
      handlers: {},
      cells: new Map(),
    }
  }

  const { handlers, cells } = ref.current
  const actionNames = new Set(Object.keys(actions))

  for (const name of Object.keys(handlers)) {
    if (!actionNames.has(name)) {
      delete handlers[name]
      cells.delete(name)
    }
  }

  for (const [name, target] of Object.entries(actions)) {
    let cell = cells.get(name)
    if (!cell) {
      const nextCell = { ctx, target }
      cell = nextCell
      cells.set(name, nextCell)
      handlers[name] = (params) => flowActionHandler(nextCell.ctx, nextCell.target)(params)
    }
    cell.ctx = ctx
    cell.target = target
  }

  return handlers as FlowActionHandlers<Actions>
}

function flowActionHandler<Flow extends Lite.Flow<any, any>>(
  ctx: Lite.ExecutionContext,
  target: FlowActionTarget<Flow>
): ActionHandler<JsonRenderActionParams, Lite.Utils.FlowOutput<Flow>> {
  if ('flow' in target) {
    return (params) => {
      if (target.input) {
        return ctx.exec<Lite.Utils.FlowOutput<Flow>, Lite.Utils.FlowInput<Flow>>({
          flow: target.flow,
          input: target.input(params),
          name: target.name,
          tags: target.tags,
        })
      }

      return ctx.exec<Lite.Utils.FlowOutput<Flow>, Lite.Utils.FlowInput<Flow>>({
        flow: target.flow,
        rawInput: target.rawInput ? target.rawInput(params) : params,
        name: target.name,
        tags: target.tags,
      })
    }
  }

  return (params) => ctx.exec<Lite.Utils.FlowOutput<Flow>, Lite.Utils.FlowInput<Flow>>({
    flow: target,
    rawInput: params,
  })
}

export { flowAction, flowActionHandlers, scopedValueStateStore, useFlowActionHandlers }
export type {
  FlowActionHandlers,
  FlowActionHandlersOptions,
  FlowActionInputOptions,
  FlowActionOptions,
  FlowActionRawInputOptions,
  FlowActionTarget,
  FlowActionTargets,
  JsonRenderActionParams,
  ScopedValueStateSource,
  ScopedValueStateStoreOptions,
  ScopedValueStateStoreSliceOptions,
}
