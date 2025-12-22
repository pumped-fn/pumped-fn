---
id: ADR-029-automatic-garbage-collection
title: Automatic Garbage Collection for Atoms
summary: >
  Add subscription-based garbage collection with cascading dependency tracking,
  configurable grace period for React Strict Mode compatibility, and explicit
  keepAlive opt-out for persistent atoms.
status: accepted
date: 2025-12-22
---

# [ADR-029] Automatic Garbage Collection for Atoms

## Status {#adr-029-status}
**Accepted** - 2025-12-22

## Problem/Requirement {#adr-029-problem}

Currently, atoms in `@pumped-fn/lite` live forever once resolved until explicitly released via `scope.release(atom)` or `scope.dispose()`. This causes memory leaks in long-running applications, especially React apps where components mount/unmount frequently.

**Current behavior:**
- `ScopeImpl.cache` holds strong references to all resolved atoms
- No automatic cleanup mechanism exists
- Users must manually call `release()` which is error-prone

**Desired behavior:**
- Atoms automatically released when no longer in use
- Cascading: dependencies stay alive while dependents are mounted
- Opt-out mechanism for persistent atoms (config, singletons)
- React Strict Mode compatible (handles double-mount/unmount)
- Minimal API changes, mostly behind-the-scenes

## Exploration Journey {#adr-029-exploration}

**Initial hypothesis:** GC logic belongs in Scope (C3-201), with possible atom config changes (C3-202).

**Explored:**

### Isolated (Current Implementation)
- `AtomEntry` tracks: state, value, cleanups, listeners, pendingInvalidate
- `entry.listeners: Map<event, Set<callback>>` already tracks subscribers
- `release(atom)` exists and runs cleanups in LIFO order
- Tag registry uses WeakRef pattern with lazy cleanup (ADR-026)

### Upstream (External Libraries)
Analyzed Jotai and Recoil GC implementations:

| Library | Pattern | Key Insight |
|---------|---------|-------------|
| **Jotai** | WeakMap + mount/unmount | Tracks `l` (listeners), `d` (deps), `t` (dependents) |
| **Recoil** | Reference counting + retention policies | `retainedBy: 'recoilRoot'` vs `'components'` |

**Jotai's approach:**
```typescript
// Atom unmounted when: listeners.size === 0 AND no mounted dependents
type Mounted = {
  l: Set<() => void>   // listeners
  d: Set<Atom>         // dependencies (what I depend on)  
  t: Set<Atom>         // dependents (what depends on me)
}
```

**Recoil's Strict Mode issue:** Reference counting confused by double-mount/unmount - tests explicitly skip Strict Mode.

### Adjacent (React Integration)
- `useSyncExternalStore` handles subscribe/unsubscribe via React lifecycle
- `ctrl.on('resolved', callback)` returns unsubscribe function
- Components unmounting trigger unsubscribe automatically
- Strict Mode double-mounts components, causing subscribe→unsubscribe→subscribe

### Downstream (Extension System)
- Extensions can hook `wrapResolve` and `wrapExec`
- GC could emit events for observability (devtools)
- No changes needed to extension interface

**Discovered:**
1. Subscription-based GC (like Jotai) is simplest and React-friendly
2. Cascading dependency tracking prevents premature release of shared atoms
3. Grace period (2-5s) handles React Strict Mode double-mount
4. `keepAlive` on atom config (not tag) is cleanest opt-out

**Confirmed:** Design applies to C3-201 (Scope), C3-202 (Atom), with React considerations for C3-301 (Hooks).

## Solution {#adr-029-solution}

### Design Principles

1. **Opt-out by default**: GC enabled, use `keepAlive: true` to prevent
2. **Cascading**: Don't GC atom B if atom A depends on it and A is still mounted
3. **Grace period**: Wait before releasing to handle React Strict Mode (default 3000ms)
4. **Minimal API**: One new atom option, one new scope option group

### API Changes

```typescript
// 1. Atom config - add keepAlive option
const configAtom = atom({
  factory: () => loadConfig(),
  keepAlive: true  // Never auto-released (default: false)
})

// 2. Scope options - add gc configuration
const scope = createScope({
  gc: {
    enabled: true,      // Default: true
    graceMs: 3000,      // Default: 3000 (React Strict Mode safe)
  }
})

// 3. Disable GC entirely
const scope = createScope({
  gc: { enabled: false }
})
```

### Internal Data Structures

```typescript
interface AtomEntry<T> {
  // Existing fields...
  state: AtomState
  value?: T
  cleanups: (() => MaybePromise<void>)[]
  listeners: Map<ListenerEvent, Set<() => void>>
  
  // NEW: GC tracking
  dependents: Set<Lite.Atom<unknown>>  // Atoms that depend on me
  gcScheduled: ReturnType<typeof setTimeout> | null  // Pending GC timer
}

interface GCOptions {
  enabled?: boolean  // Default: true
  graceMs?: number   // Default: 3000
}
```

### GC Algorithm

```
When listener unsubscribes from atom A:
  1. Decrement subscriber count
  2. If subscriberCount === 0:
     a. Check if any mounted dependents exist
     b. If no dependents AND not keepAlive:
        - Schedule GC after graceMs
  3. If GC fires:
     a. Double-check still no subscribers
     b. Release atom (runs cleanups)
     c. For each dependency B of A:
        - Remove A from B's dependents set
        - Recursively check if B can be GC'd

When subscriber resubscribes before grace period:
  - Cancel scheduled GC timer
```

### Cascading Example

```
configAtom (keepAlive: true)
    ↑
dbAtom (depends on config)
    ↑
userServiceAtom (depends on db)
    ↑
Component (subscribes to userService)
```

**Unmount sequence:**
1. Component unmounts → unsubscribes from userServiceAtom
2. userServiceAtom has no subscribers → schedule GC (3s)
3. After 3s: release userServiceAtom
4. Remove userServiceAtom from dbAtom's dependents
5. dbAtom has no subscribers AND no dependents → schedule GC
6. After 3s: release dbAtom
7. Remove dbAtom from configAtom's dependents
8. configAtom has keepAlive: true → NOT released

### React Strict Mode Handling

```
Mount (render 1):     subscribe    → count=1
Unmount (cleanup 1):  unsubscribe  → count=0 → schedule GC (3s timer)
Mount (render 2):     subscribe    → count=1 → CANCEL GC timer
                      Component works normally
```

The 3000ms grace period ensures the second mount happens before GC fires.

## Changes Across Layers {#adr-029-changes}

### Component Level

#### [C3-202] Atom
- Add `keepAlive?: boolean` to `AtomConfig` interface
- Pass through to atom instance

```typescript
// types.ts
interface Atom<T> {
  readonly [atomSymbol]: true
  readonly factory: AtomFactory<T, Record<string, Dependency>>
  readonly deps?: Record<string, Dependency>
  readonly tags?: Tagged<unknown>[]
  readonly keepAlive?: boolean  // NEW
}

// atom.ts
export function atom<T, D>(config: AtomConfig<T, D>): Lite.Atom<T> {
  return {
    [atomSymbol]: true,
    factory: config.factory,
    deps: config.deps,
    tags: config.tags,
    keepAlive: config.keepAlive,  // NEW
  }
}
```

#### [C3-201] Scope & Controller

**AtomEntry changes:**
```typescript
interface AtomEntry<T> {
  // ... existing
  dependents: Set<Lite.Atom<unknown>>  // NEW
  gcScheduled: ReturnType<typeof setTimeout> | null  // NEW
}
```

**ScopeImpl changes:**
```typescript
class ScopeImpl {
  private gcOptions: Required<GCOptions>
  
  constructor(options?: ScopeOptions) {
    this.gcOptions = {
      enabled: options?.gc?.enabled ?? true,
      graceMs: options?.gc?.graceMs ?? 3000,
    }
  }
  
  // Track dependents during resolution
  private async resolveDeps(deps, ctx?) {
    for (const [key, dep] of Object.entries(deps)) {
      if (isAtom(dep)) {
        const resolved = await this.resolve(dep)
        // NEW: Track that current atom depends on dep
        const depEntry = this.getEntry(dep)
        depEntry?.dependents.add(currentAtom)
        result[key] = resolved
      }
    }
  }
  
  // NEW: Called when listener unsubscribes
  private maybeScheduleGC<T>(atom: Lite.Atom<T>): void {
    if (!this.gcOptions.enabled) return
    if (atom.keepAlive) return
    
    const entry = this.cache.get(atom)
    if (!entry) return
    
    const subscriberCount = this.getSubscriberCount(atom)
    if (subscriberCount > 0) return
    if (entry.dependents.size > 0) return
    
    // Schedule GC with grace period
    entry.gcScheduled = setTimeout(() => {
      this.executeGC(atom)
    }, this.gcOptions.graceMs)
  }
  
  // NEW: Cancel scheduled GC (called on resubscribe)
  private cancelScheduledGC<T>(atom: Lite.Atom<T>): void {
    const entry = this.cache.get(atom)
    if (entry?.gcScheduled) {
      clearTimeout(entry.gcScheduled)
      entry.gcScheduled = null
    }
  }
  
  // NEW: Execute GC for atom
  private async executeGC<T>(atom: Lite.Atom<T>): Promise<void> {
    const entry = this.cache.get(atom)
    if (!entry) return
    
    // Double-check still eligible
    if (this.getSubscriberCount(atom) > 0) return
    if (entry.dependents.size > 0) return
    
    // Get dependencies before release
    const dependencies = atom.deps ? Object.values(atom.deps).filter(isAtom) : []
    
    // Release the atom
    await this.release(atom)
    
    // Cascade: check if dependencies can now be GC'd
    for (const dep of dependencies) {
      const depEntry = this.cache.get(dep)
      if (depEntry) {
        depEntry.dependents.delete(atom)
        this.maybeScheduleGC(dep)
      }
    }
  }
  
  // Modify addListener to cancel GC
  addListener<T>(atom, event, listener): () => void {
    this.cancelScheduledGC(atom)  // NEW
    
    const entry = this.getOrCreateEntry(atom)
    const listeners = entry.listeners.get(event)!
    listeners.add(listener)
    
    return () => {
      listeners.delete(listener)
      this.maybeScheduleGC(atom)  // NEW
    }
  }
  
  // Helper to count subscribers
  private getSubscriberCount<T>(atom: Lite.Atom<T>): number {
    const entry = this.cache.get(atom)
    if (!entry) return 0
    let count = 0
    for (const listeners of entry.listeners.values()) {
      count += listeners.size
    }
    return count
  }
}
```

### Container Level

#### [C3-2] Lite Library
- Export `GCOptions` type
- Document new behavior in README

#### [C3-3] Lite React Library
- No code changes needed
- Document grace period rationale in README

## Verification {#adr-029-verification}

- [ ] Atoms without subscribers are released after graceMs
- [ ] Atoms with `keepAlive: true` are never auto-released
- [ ] Dependencies are not released while dependents are mounted
- [ ] Cascading release works when dependent is released
- [ ] Grace period prevents release during React Strict Mode double-mount
- [ ] `gc: { enabled: false }` disables all GC
- [ ] Custom `graceMs` is respected
- [ ] `scope.release(atom)` still works for manual release
- [ ] `scope.dispose()` still releases all atoms
- [ ] Controllers work correctly with GC'd atoms (throw on access)
- [ ] Invalidation doesn't trigger GC (atom still has same subscribers)
- [ ] Preset atoms respect GC rules

### Test Cases

```typescript
describe('Automatic GC', () => {
  it('releases atom after grace period when no subscribers', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()  // Unsubscribe
    
    expect(ctrl.state).toBe('resolved')
    await delay(150)
    expect(ctrl.state).toBe('idle')  // GC'd
  })
  
  it('cancels GC when resubscribed during grace period', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value' })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub1 = ctrl.on('resolved', () => {})
    unsub1()  // Unsubscribe - schedules GC
    
    await delay(50)  // Half grace period
    const unsub2 = ctrl.on('resolved', () => {})  // Resubscribe - cancels GC
    
    await delay(100)
    expect(ctrl.state).toBe('resolved')  // Still alive
    
    unsub2()
  })
  
  it('does not release keepAlive atoms', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    const myAtom = atom({ factory: () => 'value', keepAlive: true })
    
    const ctrl = scope.controller(myAtom)
    await ctrl.resolve()
    
    const unsub = ctrl.on('resolved', () => {})
    unsub()
    
    await delay(150)
    expect(ctrl.state).toBe('resolved')  // Still alive
  })
  
  it('cascades GC to dependencies', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (ctx, { dep }) => `main-${dep}`
    })
    
    const mainCtrl = scope.controller(mainAtom)
    const depCtrl = scope.controller(depAtom)
    
    await mainCtrl.resolve()
    
    const unsub = mainCtrl.on('resolved', () => {})
    unsub()
    
    // Wait for main to be GC'd
    await delay(150)
    expect(mainCtrl.state).toBe('idle')
    
    // Wait for cascade to dep
    await delay(150)
    expect(depCtrl.state).toBe('idle')
  })
  
  it('does not release dependency while dependent is mounted', async () => {
    const scope = createScope({ gc: { graceMs: 100 } })
    
    const depAtom = atom({ factory: () => 'dep' })
    const mainAtom = atom({
      deps: { dep: depAtom },
      factory: (ctx, { dep }) => `main-${dep}`
    })
    
    const mainCtrl = scope.controller(mainAtom)
    const depCtrl = scope.controller(depAtom)
    
    await mainCtrl.resolve()
    const mainUnsub = mainCtrl.on('resolved', () => {})
    
    // Dep has no direct subscribers, but main depends on it
    await delay(150)
    expect(depCtrl.state).toBe('resolved')  // Still alive (has dependent)
    
    mainUnsub()
  })
})
```

## Migration {#adr-029-migration}

### For Users Who Want Current Behavior (No GC)

```typescript
// Disable GC entirely
const scope = createScope({
  gc: { enabled: false }
})
```

### For Users Who Want Persistent Atoms

```typescript
// Mark specific atoms as persistent
const configAtom = atom({
  factory: () => loadConfig(),
  keepAlive: true
})
```

### Breaking Changes

**None** - This is additive:
- New optional `keepAlive` on atom config
- New optional `gc` on scope options
- Behavior change is opt-out via `gc: { enabled: false }`

However, **behavioral change by default**: atoms will now be released automatically. Existing code that relies on atoms persisting without subscribers may break. Mitigation:
- Document prominently in CHANGELOG
- Consider making GC opt-in for first release, then opt-out in next major

## Related {#adr-029-related}

- [C3-201](../c3-2-lite/c3-201-scope.md) - Scope & Controller (primary implementation)
- [C3-202](../c3-2-lite/c3-202-atom.md) - Atom (keepAlive option)
- [C3-301](../c3-3-lite-react/c3-301-hooks.md) - React Hooks (grace period rationale)
- [ADR-026](./adr-026-tag-atom-registry.md) - Tag Registry (WeakRef pattern reference)
- [ADR-003](./adr-003-controller-reactivity.md) - Controller Reactivity (listener system)
