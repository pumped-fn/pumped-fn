# Lite README Improvements

## Goal

Improve README clarity on API behaviors and trade-offs. Trim unnecessary content. Help users understand what each API does and when to use it.

## Findings

### Critical Documentation Gaps

| API | What's Missing |
|-----|----------------|
| `ctx.cleanup(fn)` | Runs on **every invalidation** AND release, in LIFO order, runs **before** re-resolution |
| `ctx.data` | **Cleared on release**, persists across invalidations only. Each atom has independent storage |
| `controller(atom)` as dep | Receives **unresolved** controller (must call `resolve()`). Use when you need `.on()` reactivity |
| `ctx.invalidate()` | **Schedules** after factory completes, doesn't interrupt current execution |
| `ctrl.get()` during resolving | Returns **stale value** (previous resolved value) |
| `scope.flush()` | **Not documented at all** - waits for invalidation queue to process |
| `getOrSet()` | Barely mentioned, very useful for initialization patterns |

### Content to Trim

| Section | Action |
|---------|--------|
| Diagrams (67-77, 93-99) | Merge duplicate atom dependency diagrams |
| Flow section (175-259) | Condense - less commonly used |
| Extensions section (452-502) | Condense - advanced topic |
| Lifecycle diagrams (505-567) | Reduce from 3 to 1-2 |
| Tag direct methods (405-418) | Remove - rarely used |

## Implementation Plan

### Phase 1: Enhance API Clarity

#### 1.1 Update `ctx.cleanup()` documentation

Location: Lines 103-110 (Basic Atom section)

Current:
```typescript
const dbAtom = atom({
  factory: async (ctx) => {
    const connection = await createConnection()
    ctx.cleanup(() => connection.close())
    return connection
  }
})
```

Add after example:
```markdown
**Lifecycle:** `ctx.cleanup()` runs on every invalidation (before re-resolution) and on release. Cleanups execute in LIFO order.

For resources that should survive invalidation, use `ctx.data` instead.
```

#### 1.2 Update `ctx.data` documentation

Location: Lines 138-173 (Per-Atom Private Storage section)

Add lifecycle clarification:
```markdown
**Lifecycle:**
- **Persists** across `invalidate()` cycles
- **Cleared** on `release()` or `scope.dispose()`
- Each atom has independent storage (same tag, different atoms = separate data)
- Created lazily on first access
```

Add `getOrSet()` example:
```typescript
const cacheTag = tag<Map<string, Result>>({ label: 'cache' })

const cachedAtom = atom({
  factory: (ctx) => {
    // getOrSet: returns existing or stores and returns default
    const cache = ctx.data.getOrSet(cacheTag, new Map())
    return fetchWithCache(cache)
  }
})
```

#### 1.3 Update `controller(atom)` as dependency

Location: Lines 297-309

Current example lacks context. Replace with:
```markdown
### Controller as Dependency

Use `controller()` when you need reactive access to an atom's state changes, not just its value.

**Key difference from regular deps:**
- Regular dep (`deps: { x: atom }`) - auto-resolved, you get the value
- Controller dep (`deps: { x: controller(atom) }`) - **unresolved**, you get reactive handle

```typescript
const appAtom = atom({
  deps: { config: controller(configAtom) },
  factory: async (ctx, { config }) => {
    // Must resolve manually
    await config.resolve()

    // Subscribe to upstream changes
    const unsub = config.on('resolved', () => ctx.invalidate())
    ctx.cleanup(unsub)

    return new App(config.get())
  }
})
```

**When to use:**
- React to upstream invalidations
- Conditional/lazy resolution
- Access atom state (`config.state`)
```

#### 1.4 Update `ctx.invalidate()` documentation

Location: Lines 122-136 (Self-Invalidating Atom section)

Add clarification:
```markdown
**Behavior:** `ctx.invalidate()` schedules re-resolution after the current factory completes. It does not interrupt execution.

```typescript
const pollingAtom = atom({
  factory: async (ctx) => {
    const data = await fetchData()

    // Schedules invalidation - won't run until this factory returns
    ctx.invalidate()

    // This still executes
    return data
  }
})
```

Use `scope.flush()` in tests to wait for scheduled invalidations to complete.
```

#### 1.5 Add `ctrl.get()` stale value behavior

Location: Lines 278-287 (Basic Usage section)

Add note:
```markdown
**During resolving:** `ctrl.get()` returns the previous resolved value (stale read). This enables optimistic UI patterns.
```

#### 1.6 Add `scope.flush()` to API Reference

Location: Lines 582-593 (Scope Methods table)

Add row:
```markdown
| `scope.flush()` | Wait for pending invalidation queue to process |
```

### Phase 2: Trim Content

#### 2.1 Merge duplicate diagrams

Remove lines 67-77 (first diagram). Keep lines 91-99 (atom dependency diagram) as it's more specific.

#### 2.2 Condense Flow section

Reduce lines 175-259 to essentials:
- Keep: Basic Flow, Flow with Parse, Executing Flows
- Remove: Flow with Tags example (tags already covered elsewhere)
- Remove: Sequence diagram (already shown in Quick Start)

Target: ~50% reduction

#### 2.3 Condense Extensions section

Reduce lines 452-502:
- Keep: Interface definition, one example
- Remove: Sequence diagram (AOP pattern is self-explanatory to target audience)

Target: ~40% reduction

#### 2.4 Consolidate Lifecycle diagrams

Lines 505-567 has 3 diagrams:
- Keep: State diagram (stateDiagram-v2) - essential
- Remove: Resolution Flow sequence - redundant with earlier content
- Keep: Invalidation Flow sequence - shows cleanup timing

#### 2.5 Remove Tag direct methods

Remove lines 405-418 (Direct Tag Methods section). The deps pattern is sufficient.

### Phase 3: Final Review

- [ ] Read through complete README for flow
- [ ] Verify all code examples compile
- [ ] Check mermaid diagrams render correctly
- [ ] Run subagent review again to validate improvements

## Success Criteria

A new user reading the README should understand:

1. `ctx.cleanup()` runs on every invalidation, not just disposal
2. `ctx.data` persists across invalidations but cleared on release
3. When to use `controller(atom)` vs regular atom deps
4. `ctx.invalidate()` schedules, doesn't interrupt
5. `scope.flush()` exists for testing invalidation

README should be ~20% shorter after trimming.

## Files Changed

- `packages/lite/README.md`
