'use client'
'use no memo'

import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import { type Lite } from '@pumped-fn/lite'
import { ExecutionContextContext, ScopeContext } from './context'
import { trackPendingWork } from './pending-work'
import type { ScopedValue, ScopedValueAccess, ScopedValueView } from './scoped-value'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

interface UseAtomSuspenseOptions {
  suspense?: true
  /** @default true */
  resolve?: boolean
}

interface UseAtomManualOptions {
  suspense: false
  /** @default false */
  resolve?: boolean
}

type UseAtomOptions = UseAtomSuspenseOptions | UseAtomManualOptions

interface UseAtomState<T> {
  data: T | undefined
  loading: boolean
  error: Error | undefined
  controller: Lite.Controller<T>
}

interface UseControllerOptions {
  resolve?: boolean
}

interface UseSelectSuspenseOptions<S> {
  suspense?: true
  resolve?: boolean
  eq?: (a: S, b: S) => boolean
}

interface UseSelectManualOptions<S> {
  suspense: false
  resolve?: boolean
  eq?: (a: S, b: S) => boolean
}

type UseSelectOptions<S> = UseSelectSuspenseOptions<S> | UseSelectManualOptions<S>

interface UseSelectState<S> {
  data: S | undefined
  loading: boolean
  error: Error | undefined
}

type Load<Value> =
  | { status: 'loading'; data: undefined; error: undefined }
  | { status: 'ready'; data: Value; error: undefined }
  | { status: 'error'; data: undefined; error: Error }

interface UseResourceSuspenseOptions {
  suspense?: true
}

interface UseResourceManualOptions {
  suspense: false
}

type UseResourceOptions = UseResourceSuspenseOptions | UseResourceManualOptions

interface UseScopedValueSuspenseOptions {
  suspense?: true
}

interface UseScopedValueManualOptions {
  suspense: false
}

interface UseScopedValueSelectSuspenseOptions<State, Selected> {
  suspense?: true
  select: (snapshot: State) => Selected
  eq?: (prev: Selected, next: Selected) => boolean
}

interface UseScopedValueSelectManualOptions<State, Selected> {
  suspense: false
  select: (snapshot: State) => Selected
  eq?: (prev: Selected, next: Selected) => boolean
}

type UseScopedValueOptions<State, Selected = never> =
  | UseScopedValueSuspenseOptions
  | UseScopedValueManualOptions
  | UseScopedValueSelectSuspenseOptions<State, Selected>
  | UseScopedValueSelectManualOptions<State, Selected>

const pendingPromises = new WeakMap<Lite.Controller<unknown>, Promise<unknown>>()
const retriedControllers = new WeakSet<Lite.Controller<unknown>>()
type ResourceRecord = {
  controller: Lite.ResourceController<unknown>
  promise?: Promise<unknown>
  snapshot?: Load<unknown>
  snapshotStatus?: Load<unknown>['status']
  snapshotValue?: unknown
  snapshotError?: Error
}
const resourceRecords = new WeakMap<Lite.ExecutionContext, WeakMap<Lite.Resource<unknown>, ResourceRecord>>()

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function getResourceLoad<T>(record: ResourceRecord): Load<T> {
  const controllerState = record.controller.state
  const loadStatus = controllerState === 'resolved'
    ? 'ready'
    : controllerState === 'failed'
      ? 'error'
      : 'loading'
  let value: unknown
  let error: Error | undefined

  if (loadStatus === 'ready') {
    value = record.controller.get()
  } else if (loadStatus === 'error') {
    try {
      record.controller.get()
    } catch (e) {
      error = normalizeError(e)
    }
  }

  if (
    record.snapshot &&
    record.snapshotStatus === loadStatus &&
    record.snapshotValue === value &&
    record.snapshotError === error
  ) {
    return record.snapshot as Load<T>
  }

  const snapshot: Load<unknown> = loadStatus === 'ready'
    ? { status: 'ready', data: value, error: undefined }
    : loadStatus === 'error'
      ? { status: 'error', data: undefined, error: error! }
      : { status: 'loading', data: undefined, error: undefined }

  record.snapshot = snapshot
  record.snapshotStatus = loadStatus
  record.snapshotValue = value
  record.snapshotError = error
  return snapshot as Load<T>
}

function getResourceRecord(ctx: Lite.ExecutionContext, target: Lite.Resource<unknown>) {
  let ctxRecords = resourceRecords.get(ctx)
  if (!ctxRecords) {
    ctxRecords = new WeakMap()
    resourceRecords.set(ctx, ctxRecords)
  }

  let record = ctxRecords.get(target)
  if (!record) {
    const nextRecord: ResourceRecord = {
      controller: ctx.controller(target),
    }
    ctxRecords.set(target, nextRecord)
    record = nextRecord
  }
  return record
}

function startResourceRecord(record: ResourceRecord): Promise<unknown> {
  if (record.promise) return record.promise
  if (record.controller.state === 'resolved') return Promise.resolve(record.controller.get())
  const promise = record.controller.resolve().then(
    value => value,
    error => { throw normalizeError(error) },
  )
  promise.then(
    () => { record.promise = undefined },
    () => { record.promise = undefined },
  )
  record.promise = promise
  void promise.catch(() => {})
  return promise
}

function useResourceState<T>(resource: Lite.Resource<T>, startInRender: boolean) {
  const ctx = useExecutionContext()
  const record = getResourceRecord(ctx, resource)
  if (startInRender && record.controller.state !== 'resolved' && record.controller.state !== 'failed') {
    trackPendingWork(ctx, startResourceRecord(record))
  }
  const subscribe = useCallback((onStoreChange: () => void) => {
    return record.controller.on('*', onStoreChange)
  }, [record])
  const load = useSyncExternalStore(
    subscribe,
    () => getResourceLoad<T>(record),
    () => getResourceLoad<T>(record),
  )

  useEffect(() => {
    if (!startInRender && (record.controller.state === 'idle' || record.controller.state === 'resolving')) {
      trackPendingWork(ctx, startResourceRecord(record))
    }
  }, [ctx, load.status, record, startInRender])

  return { load, promise: record.promise }
}

const emptySubscribe = () => () => {}

function makeScopedValueView<State, Actions extends object>(
  access: ScopedValueAccess<State, Actions>,
  snapshot: State
): ScopedValueView<State, Actions> {
  return {
    get disposed() {
      return access.disposed
    },
    actions: access.actions,
    get: access.get,
    getSnapshot: access.getSnapshot,
    subscribe: access.subscribe,
    set: access.set,
    update: access.update,
    patch: access.patch,
    snapshot,
  }
}

function useScopedSnapshot<State, Actions extends object, Selected>(
  access: ScopedValueAccess<State, Actions> | undefined,
  selector: ((snapshot: State) => Selected) | undefined,
  eq: ((prev: Selected, next: Selected) => boolean) | undefined,
): ScopedValueView<State, Actions> | Selected | undefined {
  const cache = useRef<{
    access: ScopedValueAccess<State, Actions>
    snapshot: State
    selector: ((snapshot: State) => Selected) | undefined
    eq: ((prev: Selected, next: Selected) => boolean) | undefined
    value: ScopedValueView<State, Actions> | Selected
  } | null>(null)

  const subscribe = useCallback((onStoreChange: () => void) => {
    return access ? access.subscribe(onStoreChange) : emptySubscribe()
  }, [access])

  const getSnapshot = useCallback(() => {
    if (!access) return undefined

    const snapshot = access.getSnapshot()
    const current = cache.current
    if (
      current &&
      current.access === access &&
      Object.is(current.snapshot, snapshot) &&
      current.selector === selector &&
      current.eq === eq
    ) {
      return current.value
    }

    let value: ScopedValueView<State, Actions> | Selected
    if (selector) {
      const next = selector(snapshot)
      value = current &&
        current.access === access &&
        current.selector === selector &&
        (eq ?? Object.is)(current.value as Selected, next)
        ? current.value as Selected
        : next
    } else {
      value = makeScopedValueView(access, snapshot)
    }

    cache.current = { access, snapshot, selector, eq, value }
    return value
  }, [access, selector, eq])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function readyLoad<T>(data: T): Load<T> {
  return { status: 'ready', data, error: undefined }
}

function getOrCreatePendingPromise<T>(ctrl: Lite.Controller<T>): Promise<T> {
  let pending = pendingPromises.get(ctrl) as Promise<T> | undefined
  if (!pending) {
    if (ctrl.state === 'resolving') {
      pending = new Promise<T>((resolve, reject) => {
        const unsub = ctrl.on('*', () => {
          if (ctrl.state === 'resolved') {
            unsub()
            resolve(ctrl.get())
          } else if (ctrl.state === 'failed') {
            unsub()
            try { ctrl.get() } catch (e) { reject(e) }
          } else if (ctrl.state === 'idle') {
            unsub()
            reject(new Error('Atom was released during resolution'))
          }
        })
      })
    } else {
      pending = ctrl.resolve()
    }
    pendingPromises.set(ctrl, pending)
    void pending.catch(() => {})
    pending.then(
      () => pendingPromises.delete(ctrl),
      () => pendingPromises.delete(ctrl)
    )
  }
  return pending
}

/**
 * Access the current Lite.Scope from context.
 *
 * @returns The current Lite.Scope instance from context
 * @throws When called outside of a ScopeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const scope = useScope()
 *   const handleClick = () => scope.resolve(myAtom)
 * }
 * ```
 */
function useScope(): Lite.Scope {
  const scope = useContext(ScopeContext)
  if (!scope) {
    throw new Error("useScope must be used within a ScopeProvider")
  }
  return scope
}

function useExecutionContext(): Lite.ExecutionContext {
  const ctx = useContext(ExecutionContextContext)
  if (!ctx) {
    throw new Error("useExecutionContext must be used within an ExecutionContextProvider")
  }
  return ctx
}

function useResource<T>(resource: Lite.Resource<T>): T
function useResource<T>(resource: Lite.Resource<T>, options: UseResourceSuspenseOptions): T
function useResource<T>(resource: Lite.Resource<T>, options: UseResourceManualOptions): Load<T>
function useResource<T>(resource: Lite.Resource<T>, options?: UseResourceOptions): T | Load<T> {
  const { load, promise } = useResourceState(resource, options?.suspense !== false)

  if (options?.suspense === false) return load
  if (load.status === 'ready') return load.data
  if (load.status === 'error') throw load.error
  throw promise
}

function useScopedValue<State, Actions extends object>(
  value: ScopedValue<State, Actions>
): ScopedValueView<State, Actions>
function useScopedValue<State, Actions extends object>(
  value: ScopedValue<State, Actions>,
  options: UseScopedValueSuspenseOptions
): ScopedValueView<State, Actions>
function useScopedValue<State, Actions extends object, Selected>(
  value: ScopedValue<State, Actions>,
  options: UseScopedValueSelectSuspenseOptions<State, Selected>
): Selected
function useScopedValue<State, Actions extends object>(
  value: ScopedValue<State, Actions>,
  options: UseScopedValueManualOptions
): Load<ScopedValueView<State, Actions>>
function useScopedValue<State, Actions extends object, Selected>(
  value: ScopedValue<State, Actions>,
  options: UseScopedValueSelectManualOptions<State, Selected>
): Load<Selected>
function useScopedValue<State, Actions extends object, Selected>(
  value: ScopedValue<State, Actions>,
  options?: UseScopedValueOptions<State, Selected>
): ScopedValueView<State, Actions> | Selected | Load<ScopedValueView<State, Actions>> | Load<Selected> {
  const selector = options && 'select' in options ? options.select : undefined
  const eq = options && 'eq' in options ? options.eq : undefined
  const { load, promise } = useResourceState(value, options?.suspense !== false)
  const data = useScopedSnapshot(
    load.status === 'ready' ? load.data : undefined,
    selector,
    eq,
  ) as ScopedValueView<State, Actions> | Selected | undefined

  if (options?.suspense === false) {
    if (load.status !== 'ready') return load as Load<ScopedValueView<State, Actions>> | Load<Selected>
    return readyLoad(data) as Load<ScopedValueView<State, Actions>> | Load<Selected>
  }

  if (load.status === 'error') throw load.error
  if (load.status === 'loading') throw promise
  return data as ScopedValueView<State, Actions> | Selected
}

/**
 * Get a memoized controller for an atom.
 *
 * @example
 * ```tsx
 * const ctrl = useController(counterAtom)
 * ctrl.set(ctrl.get() + 1)
 * ```
 */
function useController<T>(atom: Lite.Atom<T>): Lite.Controller<T>
function useController<T>(atom: Lite.Atom<T>, options: UseControllerOptions): Lite.Controller<T>
function useController<T>(atom: Lite.Atom<T>, options?: UseControllerOptions): Lite.Controller<T> {
  const scope = useScope()
  // scope.controller() is idempotent (caches by atom in a Map), so calling it
  // every render is free and lets us skip a useMemo cell in the hook fiber.
  const ctrl = scope.controller(atom)

  if (options?.resolve) {
    if (ctrl.state === 'idle' || ctrl.state === 'resolving') {
      retriedControllers.delete(ctrl)
      throw getOrCreatePendingPromise(ctrl)
    }
    if (ctrl.state === 'failed') {
      if (retriedControllers.has(ctrl)) {
        retriedControllers.delete(ctrl)
        ctrl.get()
      }
      retriedControllers.add(ctrl)
      pendingPromises.delete(ctrl)
      throw getOrCreatePendingPromise(ctrl)
    }
    retriedControllers.delete(ctrl)
  }

  return ctrl
}

/**
 * Subscribe to atom value with Suspense/ErrorBoundary integration.
 *
 * @example
 * ```tsx
 * const user = useAtom(userAtom)
 * const { data, loading, error } = useAtom(userAtom, { suspense: false })
 * ```
 */
function useAtom<T>(atom: Lite.Atom<T>): T
function useAtom<T>(atom: Lite.Atom<T>, options: UseAtomSuspenseOptions): T
function useAtom<T>(atom: Lite.Atom<T>, options: UseAtomManualOptions): UseAtomState<T>
function useAtom<T>(atom: Lite.Atom<T>, options?: UseAtomOptions): T | UseAtomState<T> {
  const ctrl = useController(atom)
  const ctrlState = ctrl.state

  const isSuspense = options?.suspense !== false
  const autoResolve = isSuspense ? options?.resolve !== false : !!options?.resolve

  // Aggressive fast path for the canonical Suspense + auto-resolve case.
  // Skips useSyncExternalStore's snapshot-cache bookkeeping in favor of a
  // direct useReducer forceUpdate driven by a layout-effect subscription.
  // The non-Suspense path retains the full tearing-safe implementation below.
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const served = useRef<{ ctrl: Lite.Controller<T>; value: T } | null>(null)
  useIsomorphicLayoutEffect(() => {
    if (!isSuspense) return
    return ctrl.on('*', () => {
      const last = served.current
      if (last && last.ctrl === ctrl && (ctrl.state === 'resolved' || ctrl.state === 'resolving')) {
        try {
          if (Object.is(ctrl.get(), last.value)) return
        } catch {}
      }
      forceUpdate()
    })
  }, [ctrl, isSuspense])
  if (isSuspense) {
    const s = ctrl.state
    if (s === 'idle') {
      if (autoResolve) throw getOrCreatePendingPromise(ctrl)
      throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
    }
    if (s === 'failed') throw ctrl.get()
    try {
      const value = ctrl.get()
      served.current = { ctrl, value }
      return value
    } catch {
      throw getOrCreatePendingPromise(ctrl)
    }
  }

  const stateCache = useRef<{
    ctrl: Lite.Controller<T>
    ctrlState: Lite.Controller<T>['state']
    data: T | undefined
    error: Error | undefined
    loading: boolean
    result: UseAtomState<T>
  } | null>(null)

  useEffect(() => {
    if (!isSuspense && (ctrlState === 'resolving' || (autoResolve && ctrlState === 'idle'))) {
      void getOrCreatePendingPromise(ctrl).catch(() => {})
    }
  }, [ctrl, ctrlState, autoResolve, isSuspense])

  const getSnapshot = (): T | UseAtomState<T> => {
    if (isSuspense) {
      if (ctrl.state === 'idle') {
        if (autoResolve) {
          throw getOrCreatePendingPromise(ctrl)
        }
        throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
      }
      if (ctrl.state === 'failed') {
        throw ctrl.get()
      }
      try {
        return ctrl.get()
      } catch {
        throw getOrCreatePendingPromise(ctrl)
      }
    }

    let data: T | undefined
    let error: Error | undefined

    if (ctrl.state === 'resolved' || ctrl.state === 'resolving') {
      try {
        data = ctrl.get()
      } catch {}
    } else if (ctrl.state === 'failed') {
      try {
        ctrl.get()
      } catch (e) {
        error = e instanceof Error ? e : new Error(String(e))
      }
    }

    const loading = ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle')

    if (
      stateCache.current &&
      stateCache.current.ctrl === ctrl &&
      stateCache.current.ctrlState === ctrl.state &&
      stateCache.current.data === data &&
      stateCache.current.error === error &&
      stateCache.current.loading === loading
    ) {
      return stateCache.current.result
    }

    const result: UseAtomState<T> = {
      data,
      loading,
      error,
      controller: ctrl,
    }

    stateCache.current = { ctrl, ctrlState: ctrl.state, data, error, loading, result }
    return result
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (isSuspense) return ctrl.on('*', onStoreChange)
    return ctrl.on('*', () => {
      if (ctrl.state === 'resolving') {
        void getOrCreatePendingPromise(ctrl).catch(() => {})
      }
      onStoreChange()
    })
  }, [ctrl, isSuspense])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Select a derived value from an atom with fine-grained reactivity.
 * Only re-renders when the selected value changes per equality function.
 *
 * @param atom - The atom to select from
 * @param selector - Function to extract a derived value
 * @param eq - Optional equality function
 * @returns The selected value
 *
 * @example
 * ```tsx
 * const name = useSelect(userAtom, user => user.name)
 * ```
 */
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, eq?: (a: S, b: S) => boolean): S
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, options: UseSelectManualOptions<S>): UseSelectState<S>
function useSelect<T, S>(atom: Lite.Atom<T>, selector: (value: T) => S, options: UseSelectSuspenseOptions<S>): S
function useSelect<T, S>(
  atom: Lite.Atom<T>,
  selector: (value: T) => S,
  eqOrOptions?: ((a: S, b: S) => boolean) | UseSelectOptions<S>
): S | UseSelectState<S> {
  const scope = useScope()
  const ctrl = useController(atom)

  const isOptions = typeof eqOrOptions === 'object' && eqOrOptions !== null
  const isSuspense = isOptions ? (eqOrOptions as UseSelectOptions<S>).suspense !== false : true
  const autoResolve = isOptions ? !!(eqOrOptions as UseSelectOptions<S>).resolve : true
  const eq = isOptions ? (eqOrOptions as UseSelectOptions<S>).eq : eqOrOptions as ((a: S, b: S) => boolean) | undefined
  const eqFn = eq ?? Object.is

  // Aggressive: when Suspense + resolved, delegate change detection to the
  // core scope.select() handle. The handle runs the selector inside its own
  // ctrl.on('resolved') listener and only notifies on *actual value change*,
  // so 99/100 sibling components never even schedule a React re-render.
  const isResolved = ctrl.state === 'resolved'
  const handle = useMemo(() => {
    if (isSuspense && isResolved) {
      return scope.select(atom, selector, { eq: eqFn })
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, atom, selector, eqFn, isSuspense, isResolved])

  useEffect(() => {
    return () => handle?.dispose()
  }, [handle])

  const selectionCache = useRef<{
    ctrl: Lite.Controller<T>
    ctrlState: Lite.Controller<T>['state']
    source: T
    selector: (value: T) => S
    eq: ((a: S, b: S) => boolean) | undefined
    value: S
  } | null>(null)

  const selectStateCache = useRef<{
    ctrl: Lite.Controller<T>
    data: S | undefined
    loading: boolean
    error: Error | undefined
    result: UseSelectState<S>
  } | null>(null)

  useEffect(() => {
    if (!isSuspense && (ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle'))) {
      void getOrCreatePendingPromise(ctrl).catch(() => {})
    }
  }, [ctrl, ctrl.state, autoResolve, isSuspense])

  const getSnapshot = (): S | UseSelectState<S> => {
    if (isSuspense) {
      const state = ctrl.state
      if (state === 'idle') {
        if (autoResolve) throw getOrCreatePendingPromise(ctrl)
        throw new Error('Atom is not resolved. Set resolve: true or resolve the atom before rendering.')
      }
      if (state === 'failed') throw ctrl.get()
      // Fast path when we have a handle: pure field read, no selector call.
      if (handle) return handle.get()
      let value: T
      try { value = ctrl.get() } catch { throw getOrCreatePendingPromise(ctrl) }

      const current = selectionCache.current
      if (
        current &&
        current.ctrl === ctrl &&
        current.ctrlState === state &&
        Object.is(current.source, value) &&
        current.selector === selector &&
        current.eq === eq
      ) {
        return current.value
      }

      const nextValue = selector(value)
      const selectedValue = current &&
        current.ctrl === ctrl &&
        current.selector === selector &&
        eqFn(current.value, nextValue)
        ? current.value
        : nextValue

      selectionCache.current = {
        ctrl,
        ctrlState: state,
        source: value,
        selector,
        eq,
        value: selectedValue,
      }

      return selectedValue
    }

    let data: S | undefined
    let error: Error | undefined

    if (ctrl.state === 'resolved' || ctrl.state === 'resolving') {
      try {
        const value = ctrl.get()
        const current = selectionCache.current
        if (
          current &&
          current.ctrl === ctrl &&
          current.ctrlState === ctrl.state &&
          Object.is(current.source, value) &&
          current.selector === selector &&
          current.eq === eq
        ) {
          data = current.value
        } else {
          const nextValue = selector(value)
          const selectedValue = current &&
            current.ctrl === ctrl &&
            current.selector === selector &&
            eqFn(current.value, nextValue)
            ? current.value
            : nextValue

          selectionCache.current = {
            ctrl,
            ctrlState: ctrl.state,
            source: value,
            selector,
            eq,
            value: selectedValue,
          }
          data = selectedValue
        }
      } catch (e) {
        if (ctrl.state !== 'resolving') {
          error = e instanceof Error ? e : new Error(String(e))
        }
      }
    } else if (ctrl.state === 'failed') {
      try { ctrl.get() } catch (e) { error = e instanceof Error ? e : new Error(String(e)) }
    }

    const loading = ctrl.state === 'resolving' || (autoResolve && ctrl.state === 'idle')

    if (
      selectStateCache.current &&
      selectStateCache.current.ctrl === ctrl &&
      selectStateCache.current.data === data &&
      selectStateCache.current.error === error &&
      selectStateCache.current.loading === loading
    ) {
      return selectStateCache.current.result
    }

    const result: UseSelectState<S> = { data, loading, error }
    selectStateCache.current = { ctrl, data, loading, error, result }
    return result
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    // With a handle, change detection happens inside the handle itself.
    // Only 1/100 components fires onStoreChange per mutation — the rest never
    // schedule a React re-render. We still subscribe to ctrl.on('*') so state
    // transitions (idle/failed/resolving) re-render for Suspense/Error flows.
    if (handle && isSuspense) {
      const offHandle = handle.subscribe(onStoreChange)
      const offCtrl = ctrl.on('*', () => {
        if (ctrl.state !== 'resolved') onStoreChange()
      })
      return () => { offHandle(); offCtrl() }
    }
    if (isSuspense) return ctrl.on('*', onStoreChange)
    return ctrl.on('*', () => {
      if (ctrl.state === 'resolving') void getOrCreatePendingPromise(ctrl).catch(() => {})
      onStoreChange()
    })
  }, [ctrl, isSuspense, handle])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export { useScope, useExecutionContext, useController, useAtom, useSelect, useResource, useScopedValue }
export type { Load, UseAtomSuspenseOptions, UseAtomManualOptions, UseAtomOptions, UseAtomState, UseControllerOptions, UseSelectSuspenseOptions, UseSelectManualOptions, UseSelectOptions, UseSelectState, UseResourceSuspenseOptions, UseResourceManualOptions, UseResourceOptions, UseScopedValueSuspenseOptions, UseScopedValueManualOptions, UseScopedValueSelectSuspenseOptions, UseScopedValueSelectManualOptions, UseScopedValueOptions }
