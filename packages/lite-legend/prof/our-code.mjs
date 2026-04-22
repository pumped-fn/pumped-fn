#!/usr/bin/env node
/**
 * Filters cpuprofile samples to functions in our own packages (lite/,
 * lite-react/, lite-legend/) and reports self-time totals.
 */
import { readFileSync } from 'node:fs'

const [, , profilePath, topNArg] = process.argv
const topN = Number(topNArg ?? '40')
const prof = JSON.parse(readFileSync(profilePath, 'utf8'))
const byId = new Map()
for (const n of prof.nodes) byId.set(n.id, n)

const parent = new Map()
for (const n of prof.nodes) if (n.children) for (const c of n.children) parent.set(c, n.id)

const OURS = /packages\/(lite|lite-react|lite-legend|lite-hmr|lite-ui)\//
const REACT = /react(-dom)?\/cjs\/react/
const LEGEND = /@legendapp\/state/
const JSDOM = /\/jsdom\//

function fmt(n) {
  const cf = n.callFrame
  const fn = cf.functionName || '(anonymous)'
  const url = (cf.url || '').replace(/^.+\/node_modules\/\.pnpm\//, '…/.pnpm/')
    .replace(/^file:\/\/\/home\/user\/pumped-fn\//, '')
    .replace(/^\/home\/user\/pumped-fn\//, '')
  return { fn, url, line: cf.lineNumber + 1, label: url ? `${fn} @ ${url}:${cf.lineNumber + 1}` : fn }
}

function bucket(url) {
  if (!url) return 'node'
  if (OURS.test(url)) return 'ours'
  if (REACT.test(url)) return 'react'
  if (LEGEND.test(url)) return 'legend'
  if (JSDOM.test(url)) return 'jsdom'
  if (url.includes('node:')) return 'node'
  if (url.includes('tsx')) return 'tsx'
  return 'other'
}

const buckets = new Map()
const ours = new Map()
let total = 0
for (let i = 0; i < prof.samples.length; i++) {
  const leaf = byId.get(prof.samples[i])
  const dt = prof.timeDeltas[i] ?? 0
  total += dt
  if (!leaf) continue
  const info = fmt(leaf)
  const b = bucket(info.url)
  buckets.set(b, (buckets.get(b) ?? 0) + dt)
  if (b === 'ours') ours.set(info.label, (ours.get(info.label) ?? 0) + dt)
}

console.log(`\n=== BUCKET totals (self, ${(total / 1000).toFixed(1)}ms) ===`)
for (const [name, t] of [...buckets.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t.toString().padStart(10)}  ${((t / total) * 100).toFixed(1).padStart(5)}%  ${name}`)
}

console.log(`\n=== OUR code self-time top ${topN} ===`)
for (const [label, t] of [...ours.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) {
  console.log(`  ${t.toString().padStart(10)}  ${((t / total) * 100).toFixed(1).padStart(5)}%  ${label}`)
}
