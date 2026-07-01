import { type Lite } from "@pumped-fn/lite"
import { sync } from "../src"

const draft = sync({
  id: "draft",
  factory: () => ({ title: "", body: "" }),
})

const value: Lite.Utils.AtomValue<typeof draft> = { title: "Title", body: "Body" }

const versioned = sync({
  id: "versioned",
  factory: () => ({ title: "", version: 0 }),
  conflict: sync.revision("version"),
})

const versionedValue: Lite.Utils.AtomValue<typeof versioned> = { title: "Title", version: 1 }

sync({
  id: "bad-revision",
  factory: () => ({ title: "" }),
  // @ts-expect-error revision key must exist as a number
  conflict: sync.revision("version"),
})

sync({
  id: "session",
  factory: () => ({ expiresAt: new Date(0) }),
  codec: sync.codec({
    encode: (input: { expiresAt: Date }) => ({ expiresAt: input.expiresAt.toISOString() }),
    decode: (raw: { expiresAt: string }) => ({ expiresAt: new Date(raw.expiresAt) }),
  }),
})

sync({
  id: "derived",
  deps: { draft },
  factory: (_ctx, deps) => ({ title: deps.draft.title, body: deps.draft.body }),
})

// @ts-expect-error non-json values need a codec
sync({
  id: "bad",
  factory: () => ({ expiresAt: new Date(0) }),
})

// @ts-expect-error dependency values stay inferred
value.extra = "nope"
