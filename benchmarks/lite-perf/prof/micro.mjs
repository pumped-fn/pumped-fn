#!/usr/bin/env node
/**
 * Pure library microbench — no React, no JSDOM, no test harness.
 * Measures the hot paths the React bench exercises but in isolation.
 */
import { atom, createScope } from '@pumped-fn/lite'

const ITERS = Number(process.env.ITERS ?? '1000')
const KEY_COUNT = Number(process.env.KEYS ?? '100')
const UPDATES = Number(process.env.UPDATES ?? '100')
const KEYS = Array.from({ length: KEY_COUNT }, (_, i) => `k${i}`)
const HOT_KEY = 'k7'

function makeState() {
  const s = {}
  for (const k of KEYS) s[k] = 0
  return s
}

function time(label, fn) {
  // Warm-up
  for (let i = 0; i < 3; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < ITERS; i++) fn()
  const totalMs = performance.now() - t0
  const hz = (ITERS * 1000) / totalMs
  console.log(`METRIC ${label}=${hz.toFixed(3)}`)
  return { label, hz, totalMs }
}

// ---------------------------------------------------------------------------
// 1. Raw ctrl.set notification fan-out (N listeners on one atom).
// ---------------------------------------------------------------------------
{
  const a = atom({ factory: () => makeState() })
  const scope = createScope()
  await scope.resolve(a)
  const ctrl = scope.controller(a)
  // Pre-register 100 cheap listeners
  for (let i = 0; i < 100; i++) ctrl.on('*', () => {})

  time('raw_set_100listeners_hz', () => {
    for (let i = 0; i < UPDATES; i++) {
      ctrl.set({ ...ctrl.get(), [HOT_KEY]: i + 1 })
    }
  })
}

// ---------------------------------------------------------------------------
// 2. scope.select fan-out: 100 handles, each with a distinct selector.
// ---------------------------------------------------------------------------
{
  const a = atom({ factory: () => makeState() })
  const scope = createScope()
  await scope.resolve(a)
  const ctrl = scope.controller(a)
  const handles = []
  for (const k of KEYS) {
    const h = scope.select(a, (s) => s[k])
    h.subscribe(() => {})
    handles.push(h)
  }

  time('scope_select_100handles_hz', () => {
    for (let i = 0; i < UPDATES; i++) {
      ctrl.set({ ...ctrl.get(), [HOT_KEY]: i + 1 })
    }
  })
}

// ---------------------------------------------------------------------------
// 3. notifyListeners-only synthetic microbench (pass-through set without
//    subscribers doesn't exercise notify; use a large subscriber set).
// ---------------------------------------------------------------------------
{
  const a = atom({ factory: () => 0 })
  const scope = createScope()
  await scope.resolve(a)
  const ctrl = scope.controller(a)
  for (let i = 0; i < 1000; i++) ctrl.on('*', () => {})

  time('raw_set_1000listeners_hz', () => {
    for (let i = 0; i < 100; i++) ctrl.set(i)
  })
}

// ---------------------------------------------------------------------------
// 4. Many atoms, one listener each — measures per-atom overhead.
// ---------------------------------------------------------------------------
{
  const scope = createScope()
  const atoms = []
  for (let i = 0; i < 100; i++) {
    const a = atom({ factory: () => 0 })
    atoms.push(a)
    await scope.resolve(a)
    scope.controller(a).on('*', () => {})
  }

  time('many_atoms_single_set_hz', () => {
    for (let n = 0; n < 10; n++) {
      for (const a of atoms) scope.controller(a).set(n)
    }
  })
}
