#!/usr/bin/env node
/**
 * Summarizes a .cpuprofile produced by `node --cpu-prof`.
 *
 * Usage: node prof/analyze.mjs <profile.cpuprofile> [topN=30]
 *
 * Computes per-function self time + total time by walking samples and
 * associating each sample's leaf node (self) and ancestor nodes (total)
 * with the corresponding timeDelta.
 */
import { readFileSync } from 'node:fs'

const [, , profilePath, topNArg] = process.argv
if (!profilePath) {
  console.error('usage: analyze.mjs <profile.cpuprofile> [topN=30]')
  process.exit(2)
}
const topN = Number(topNArg ?? '30')
const prof = JSON.parse(readFileSync(profilePath, 'utf8'))
const byId = new Map()
for (const n of prof.nodes) byId.set(n.id, n)

const self = new Map()
const total = new Map()
const add = (m, n, dt) => {
  const label = fmt(n)
  m.set(label, (m.get(label) ?? 0) + dt)
}
function fmt(n) {
  const cf = n.callFrame
  const fn = cf.functionName || '(anonymous)'
  const url = cf.url || ''
  // Strip long absolute prefixes for readability.
  const short = url.replace(/^.+\/node_modules\/\.pnpm\//, '…/.pnpm/')
    .replace(/^file:\/\/\/home\/user\/pumped-fn\//, '')
    .replace(/^\/home\/user\/pumped-fn\//, '')
  if (!short) return fn
  return `${fn} @ ${short}:${cf.lineNumber + 1}`
}

// Accumulate.
const samples = prof.samples
const deltas = prof.timeDeltas
// Walk: for each sample, walk from leaf up via parent pointers.
// cpuprofile format does not store parent directly but does store children — so
// build a parent map first.
const parent = new Map()
for (const n of prof.nodes) {
  if (n.children) for (const c of n.children) parent.set(c, n.id)
}

let totalTime = 0
for (let i = 0; i < samples.length; i++) {
  const leafId = samples[i]
  const dt = deltas[i] ?? 0
  totalTime += dt
  const leaf = byId.get(leafId)
  if (!leaf) continue
  add(self, leaf, dt)
  // Walk up; each ancestor gets "total" time.
  let cur = leafId
  const seen = new Set()
  while (cur != null) {
    if (seen.has(cur)) break
    seen.add(cur)
    add(total, byId.get(cur), dt)
    cur = parent.get(cur)
  }
}

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])

function table(label, rows) {
  console.log(`\n=== ${label} (µs, ${(totalTime / 1000).toFixed(1)}ms total) ===`)
  for (const [name, t] of rows.slice(0, topN)) {
    const pct = ((t / totalTime) * 100).toFixed(1)
    console.log(`  ${t.toString().padStart(10)}  ${pct.padStart(5)}%  ${name}`)
  }
}

table('SELF', sortDesc(self))
table('TOTAL', sortDesc(total))
