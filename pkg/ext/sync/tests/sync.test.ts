import { describe, expect, it } from "vitest"
import { atom, controller, createScope, resource, type Lite } from "@pumped-fn/lite"
import { sync, type Sync } from "../src"

describe("sync extension", () => {
  it("replicates plain state through scope tags and public controllers", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire = sync.memory()
    const left = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "left", transport: wire })],
    })
    const right = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "right", transport: wire })],
    })

    await left.resolve(draft)
    await right.resolve(draft)
    left.controller(draft).set({ title: "Plan", body: "sync" })

    expect(right.controller(draft).get()).toEqual({ title: "Plan", body: "sync" })
    expect(wire.records()).toHaveLength(2)
    await left.dispose()
    await right.dispose()
  })

  it("hydrates later scopes from the transport record", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire = sync.memory()
    const left = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "left", transport: wire, namespace: "team" })],
    })

    await left.resolve(draft)
    left.controller(draft).set({ title: "Saved", body: "later" })

    const right = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "right", transport: wire, namespace: "team" })],
    })

    expect(await right.resolve(draft)).toEqual({ title: "Saved", body: "later" })
    expect(right.controller(draft).get()).toEqual({ title: "Saved", body: "later" })
    await left.dispose()
    await right.dispose()
  })

  it("does not close a shared transport when one scope is disposed", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire = sync.memory()
    const left = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "left", transport: wire })],
    })
    const right = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "right", transport: wire })],
    })

    await left.resolve(draft)
    await right.resolve(draft)
    await left.dispose()
    await wire.write({
      key: "draft",
      peer: "remote",
      version: 1,
      value: { title: "Remote", body: "still live" },
    })

    expect(right.controller(draft).get()).toEqual({ title: "Remote", body: "still live" })
    await right.dispose()
  })

  it("rejects invalid remote payloads before apply", async () => {
    const errors: Array<[unknown, Sync.ErrorPhase]> = []
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (error, phase) => errors.push([error, phase]),
        }),
      ],
    })

    await scope.resolve(draft)
    await wire.write({
      key: "draft",
      peer: "remote",
      version: 1,
      value: { title: "bad", body: Number.NaN },
    })

    expect(scope.controller(draft).get()).toEqual({ title: "", body: "" })
    expect(errors.map((entry) => entry[1])).toEqual(["decode"])
    await scope.dispose()
  })

  it("isolates remote delivery failures from synchronous transport writes", async () => {
    const errors: Sync.ErrorPhase[] = []
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          failure: "throw",
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(draft)
    await wire.write({
      key: "draft",
      peer: "remote",
      version: 1,
      value: { title: "bad", body: Number.NaN },
    })

    expect(scope.controller(draft).get()).toEqual({ title: "", body: "" })
    expect(errors).toEqual(["decode"])
    await scope.dispose()
  })

  it("uses codecs for non-json local state", async () => {
    const session = sync({
      id: "session",
      factory: () => ({ expiresAt: new Date(0) }),
      codec: sync.codec({
        encode: (value: { expiresAt: Date }) => ({ expiresAt: value.expiresAt.toISOString() }),
        decode: (raw: { expiresAt: string }) => ({ expiresAt: new Date(raw.expiresAt) }),
      }),
    })
    const wire = sync.memory()
    const left = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "left", transport: wire })],
    })
    const right = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "right", transport: wire })],
    })

    await left.resolve(session)
    await right.resolve(session)
    left.controller(session).set({ expiresAt: new Date(1000) })

    expect(right.controller(session).get().expiresAt.getTime()).toBe(1000)
    await left.dispose()
    await right.dispose()
  })

  it("surfaces equal-revision conflicts without applying the remote value", async () => {
    const conflicts: Sync.Conflict<unknown>[] = []
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", version: 0 }),
      conflict: sync.revision("version"),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onConflict: (conflict) => conflicts.push(conflict),
        }),
      ],
    })

    await scope.resolve(draft)
    scope.controller(draft).set({ title: "local", version: 1 })
    await wire.write({
      key: "draft",
      peer: "remote",
      version: 1,
      value: { title: "remote", version: 1 },
    })

    expect(scope.controller(draft).get()).toEqual({ title: "local", version: 1 })
    expect(conflicts).toHaveLength(1)

    await wire.write({
      key: "draft",
      peer: "remote",
      version: 2,
      value: { title: "old", version: 0 },
    })
    expect(scope.controller(draft).get()).toEqual({ title: "local", version: 1 })

    await wire.write({
      key: "draft",
      peer: "remote",
      version: 3,
      value: { title: "new", version: 2 },
    })
    expect(scope.controller(draft).get()).toEqual({ title: "new", version: 2 })
    await scope.dispose()
  })

  it("can throw runtime failures when configured", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire: Sync.Transport = {
      read: () => undefined,
      write: () => {},
      subscribe() {
        throw new Error("subscribe failed")
      },
    }
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "local", transport: wire, failure: "throw" })],
    })

    await expect(scope.resolve(draft)).rejects.toThrow("subscribe failed")
  })

  it("isolates subscribe failures while keeping local state writable", async () => {
    const errors: Sync.ErrorPhase[] = []
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire: Sync.Transport = {
      read: () => undefined,
      write: () => {},
      subscribe() {
        throw new Error("subscribe failed")
      },
    }
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(draft)
    scope.controller(draft).set({ title: "Changed", body: "" })

    expect(scope.controller(draft).get()).toEqual({ title: "Changed", body: "" })
    expect(errors).toEqual(["subscribe"])
    await scope.dispose()
  })

  it("isolates unexpected listener failures from transport dispatch", async () => {
    const errors: Sync.ErrorPhase[] = []
    let listener: (message: Sync.Message) => void = () => {
      throw new Error("listener missing")
    }
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const broken = {
      key: "draft",
      get peer() {
        throw new Error("listener failed")
      },
      version: 1,
      value: { title: "Remote", body: "" },
    } satisfies Sync.Message
    const wire: Sync.Transport = {
      read: () => undefined,
      write: () => {},
      subscribe(_key, next) {
        listener = next
        return () => {}
      },
    }
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          failure: "throw",
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(draft)
    listener(broken)

    expect(errors).toEqual(["subscribe"])
    await scope.dispose()
  })

  it("can throw read failures when configured", async () => {
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const wire: Sync.Transport = {
      read: () => {
        throw new Error("read failed")
      },
      write: () => {},
      subscribe() {
        return () => {}
      },
    }
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "local", transport: wire, failure: "throw" })],
    })

    await expect(scope.resolve(draft)).rejects.toThrow("read failed")
  })

  it("keeps sync atoms local when no runtime tag is installed", async () => {
    const draft = sync({
      id: "draft",
      factory: async () => ({ title: "Local", body: "" }),
    })
    const scope = createScope({
      extensions: [sync.extension()],
    })

    expect(await scope.resolve(draft)).toEqual({ title: "Local", body: "" })
    scope.controller(draft).set({ title: "Changed", body: "" })
    expect(scope.controller(draft).get()).toEqual({ title: "Changed", body: "" })
    await scope.dispose()
  })

  it("supports dependencies without rehydrating stale transport state on rerun", async () => {
    const source = atom({
      factory: () => ({ title: "First" }),
    })
    const draft = sync({
      id: "draft",
      deps: { source: controller(source, { resolve: true, watch: true }) },
      factory: async (_ctx, deps) => ({ title: deps.source.get().title, body: "" }),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "local", transport: wire })],
    })

    expect(await scope.resolve(draft)).toEqual({ title: "First", body: "" })
    scope.controller(source).set({ title: "Second" })
    await scope.flush()

    expect(scope.controller(draft).get()).toEqual({ title: "Second", body: "" })
    await scope.dispose()
  })

  it("validates synchronous dependency factories", async () => {
    const source = atom({
      factory: () => ({ title: "Source" }),
    })
    const draft = sync({
      id: "draft",
      deps: { source },
      factory: (_ctx, deps) => ({ title: deps.source.title, body: "" }),
    })
    const scope = createScope()

    expect(await scope.resolve(draft)).toEqual({ title: "Source", body: "" })
    await scope.dispose()
  })

  it("reports read and write transport failures without applying remote trust", async () => {
    const errors: Sync.ErrorPhase[] = []
    const draft = sync({
      id: "draft",
      factory: () => ({ title: "", body: "" }),
    })
    const listeners = new Set<(message: Sync.Message) => void>()
    const wire: Sync.Transport = {
      read: () => {
        throw new Error("read failed")
      },
      write: () => {
        throw new Error("write failed")
      },
      subscribe(_key, listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(draft)
    scope.controller(draft).set({ title: "Changed", body: "" })
    await Promise.resolve()

    expect(listeners.size).toBe(1)
    expect(errors).toEqual(["read", "write", "write"])
    await scope.dispose()
    expect(listeners.size).toBe(0)
  })

  it("leaves non-atom resolution untouched", async () => {
    const tx = resource({
      name: "tx",
      factory: () => "ready",
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension({ name: "custom-sync" })],
      tags: [sync.runtime({ peer: "local", transport: wire })],
    })
    const ctx = scope.createContext()

    expect(await ctx.resolve(tx)).toBe("ready")
    await ctx.close()
    await scope.dispose()
  })

  it("rejects local writes that no longer satisfy the codec", async () => {
    const errors: Sync.ErrorPhase[] = []
    const entry = sync({
      id: "entry",
      factory: () => ({ value: "ok" }),
      codec: sync.codec({
        encode(value: { value: string }) {
          if (value.value === "bad") throw new Error("bad value")
          return value
        },
        decode: (raw: { value: string }) => raw,
      }),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(entry)
    scope.controller(entry).set({ value: "bad" })

    expect(errors).toEqual(["encode"])
    expect(wire.records()).toHaveLength(1)
    await scope.dispose()
  })

  it("rejects non-json local writes on the default codec", async () => {
    const errors: Sync.ErrorPhase[] = []
    const entry = sync({
      id: "entry",
      factory: () => ({ value: "ok" }),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(entry)
    const ctrl = scope.controller(entry) as Lite.Controller<unknown>
    ctrl.set(Symbol("bad"))

    expect(errors).toEqual(["encode"])
    await scope.dispose()
  })

  it("applies lww updates and ignores older revision updates", async () => {
    const entry = sync({
      id: "entry",
      factory: () => ({ title: "local", updatedAt: 1 }),
      conflict: sync.lww((value) => value.updatedAt),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "local", transport: wire })],
    })

    await scope.resolve(entry)
    await wire.write({
      key: "entry",
      peer: "remote",
      version: 1,
      value: { title: "old", updatedAt: 0 },
    })
    expect(scope.controller(entry).get()).toEqual({ title: "local", updatedAt: 1 })

    await wire.write({
      key: "entry",
      peer: "remote",
      version: 2,
      value: { title: "new", updatedAt: 2 },
    })
    expect(scope.controller(entry).get()).toEqual({ title: "new", updatedAt: 2 })
    await scope.dispose()
  })

  it("reports revision declaration failures without applying remote values", async () => {
    const errors: Sync.ErrorPhase[] = []
    const entry = sync({
      id: "entry",
      factory: () => ({ title: "local", version: 1 }),
      conflict: sync.revision("version"),
    })
    const callback = sync({
      id: "callback",
      factory: () => ({ title: "local", version: 1 }),
      conflict: sync.revision(() => Number.NaN),
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    await scope.resolve(entry)
    await wire.write({ key: "entry", peer: "remote", version: 1, value: { title: "missing" } })
    await wire.write({ key: "entry", peer: "remote", version: 2, value: null })
    await scope.resolve(callback)
    await wire.write({ key: "callback", peer: "remote", version: 1, value: { title: "remote", version: 2 } })

    expect(scope.controller(entry).get()).toEqual({ title: "local", version: 1 })
    expect(scope.controller(callback).get()).toEqual({ title: "local", version: 1 })
    expect(errors).toEqual(["conflict", "conflict", "conflict"])
    await scope.dispose()
  })

  it("compares array payloads without echoing identical remote records", async () => {
    const list = sync({
      id: "list",
      factory: () => ["a"],
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [sync.runtime({ peer: "local", transport: wire })],
    })

    await scope.resolve(list)
    await wire.write({
      key: "list",
      peer: "remote",
      version: 1,
      value: ["a"],
    })
    await wire.write({
      key: "list",
      peer: "remote",
      version: 2,
      value: ["a", "b"],
    })

    expect(scope.controller(list).get()).toEqual(["a", "b"])
    expect(wire.records()).toHaveLength(3)
    await scope.dispose()
    wire.clear()
    wire.close?.()
    expect(wire.records()).toEqual([])
    expect(wire.size()).toBe(0)
  })

  it("covers json comparison and decoder edge cases through remote records", async () => {
    const errors: Sync.ErrorPhase[] = []
    const value = sync({
      id: "value",
      factory: (): Sync.Value => ({ title: "a" }),
    })
    const empty = sync({
      id: "empty",
      factory: () => null,
    })
    const wire = sync.memory()
    const scope = createScope({
      extensions: [sync.extension()],
      tags: [
        sync.runtime({
          peer: "local",
          transport: wire,
          onError: (_error, phase) => errors.push(phase),
        }),
      ],
    })

    expect(await scope.resolve(empty)).toBeNull()
    await scope.resolve(value)
    await wire.write({ key: "value", peer: "remote", version: 1, value: { other: "text" } })
    await wire.write({ key: "value", peer: "remote", version: 2, value: "text" })
    await wire.write({ key: "value", peer: "remote", version: 3, value: { other: "next", extra: true } })
    await wire.write({ key: "value", peer: "remote", version: 4, value: { other: "final" } })
    await wire.write({ key: "value", peer: "remote", version: 5, value: ["x"] })
    await wire.write({ key: "value", peer: "remote", version: 6, value: ["y"] })
    await wire.write({ key: "value", peer: "remote", version: 7, value: new Date() as unknown as Sync.Value })

    expect(scope.controller(value).get()).toEqual(["y"])
    expect(errors).toEqual(["decode"])
    await scope.dispose()

    const alone = sync.memory()
    await alone.write({ key: "none", peer: "nobody", version: 1, value: null })
    expect(alone.records()).toHaveLength(1)
  })
})
