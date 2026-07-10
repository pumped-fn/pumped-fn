// Deterministic behavioral checker for T-9 (podcast transcript backfill with staged retry).
// Run FROM INSIDE an instantiated workspace (so bare imports resolve):
//   cp check-t9.mjs <workspace>/ && cd <workspace> && node --import tsx check-t9.mjs
// Prints a JSON verdict {checks: {id: "pass"|"fail"}, errors, failed} and exits 1 on any fail.
//
// chal-2 H2-T9 amendments implemented here:
//   - checker-injected fake SpeechVendor with a per-call log: attempts must hit the VENDOR
//     exactly per the retry policy (busy,busy,ok => 3 vendor calls), not just per-attempt totals
//   - transcript persistence: the prescribed getTranscript surface must round-trip the exact
//     text the fake vendor produced (unique per scenario; unknowable without calling the vendor)
//   - retry gated on error CLASS: non-retryable code stops after exactly 1 vendor call
//   - prepared-invocation identity: prepare() is runtime-transparent by design (probe: parse
//     and wrapExec both fire once PER attempt; scope.ts prepare() captures options once and
//     each exec() is a full ctx.exec) — so the strongest library-expressible signal is a
//     static staging-site scan (s1) plus the answer key's reviewer-quoted staging site.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createScope, isFlow, isTag } from "@pumped-fn/lite"

const mod = await import("./src/transcripts.ts")

const checks = {}
const errors = {}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const eq = (actual, expected, label) => {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  assert(a === b, `${label}: expected ${b}, got ${a}`)
}

const check = async (id, fn) => {
  try {
    await fn()
    checks[id] = "pass"
  } catch (error) {
    checks[id] = "fail"
    errors[id] = String(error?.message ?? error)
  }
}

// Scripted vendor OWNED BY THE CHECKER. Replies are consumed in call order per episode:
// "busy" rejects with code vendor-busy, "fail:<code>" rejects with that code, anything
// else resolves as the transcript text.
const scriptedVendor = (scripts) => {
  const calls = []
  const cursors = new Map()
  return {
    calls,
    vendor: {
      transcribe: (request) => {
        calls.push({ episodeId: request.episodeId })
        const line = scripts[request.episodeId] ?? []
        const index = cursors.get(request.episodeId) ?? 0
        cursors.set(request.episodeId, index + 1)
        const reply = line[index] ?? "fail:unscripted-call"
        if (reply === "busy") {
          return Promise.reject(Object.assign(new Error("vendor busy"), { code: "vendor-busy" }))
        }
        if (typeof reply === "string" && reply.startsWith("fail:")) {
          const code = reply.slice(5)
          return Promise.reject(Object.assign(new Error(code), { code }))
        }
        return Promise.resolve({ text: reply })
      },
    },
  }
}

const instantBackoff = () => {
  const waits = []
  return { waits, wait: (attempt) => { waits.push(attempt); return Promise.resolve() } }
}

const tracer = () => {
  const names = []
  return {
    names,
    extension: {
      name: "t9-tracer",
      wrapExec: (next, _target, ctx) => {
        names.push(ctx.name ?? "anonymous")
        return next()
      },
    },
  }
}

// One scenario = fresh scope + injected vendor/backoff seams + optional extra extensions.
const session = async (scripts, run, extensions = []) => {
  const { vendor, calls } = scriptedVendor(scripts)
  const { wait, waits } = instantBackoff()
  const scope = createScope({
    tags: [mod.speechVendor(vendor), mod.backoff(wait)],
    extensions,
  })
  const ctx = scope.createContext()
  try {
    return await run({ ctx, scope, calls, waits })
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}

const runBackfill = (ctx, episodeIds, maxAttempts) =>
  ctx.exec({ flow: mod.backfill, input: { episodeIds, maxAttempts } })
const readTranscript = (ctx, episodeId) =>
  ctx.exec({ flow: mod.getTranscript, input: { episodeId } })

await check("decl-exports", async () => {
  assert(isFlow(mod.backfill), "export backfill is not an executable flow")
  assert(isFlow(mod.transcribeEpisode), "export transcribeEpisode is not an executable flow")
  assert(isFlow(mod.getTranscript), "export getTranscript is not an executable flow")
  assert(isTag(mod.speechVendor), "export speechVendor is not a tag (vendor injection point)")
  assert(isTag(mod.backoff), "export backoff is not a tag (swappable delay source)")
  assert(typeof mod.attemptLedger === "function", "export attemptLedger is not a factory function")
})

const TEXT_E1 = "b1 transcript: two busy replies then success, attempt three"

await check("b1-vendor-call-log-per-retry-policy", async () => {
  await session({ e1: ["busy", "busy", TEXT_E1] }, async ({ ctx, calls, waits }) => {
    const result = await runBackfill(ctx, ["e1"], 5)
    eq(result.done, ["e1"], "done list")
    eq(result.failed, [], "failed list")
    eq(calls, [{ episodeId: "e1" }, { episodeId: "e1" }, { episodeId: "e1" }],
      "vendor call log for busy,busy,ok must show exactly 3 calls carrying the episodeId")
    eq(waits.length, 2, "backoff source invoked exactly between attempts (2 waits for 3 attempts)")
  })
})

await check("b2-transcript-roundtrip-cross-context", async () => {
  await session({ e1: ["busy", TEXT_E1] }, async ({ ctx, scope }) => {
    await runBackfill(ctx, ["e1"], 3)
    eq(await readTranscript(ctx, "e1"), { text: TEXT_E1 }, "same-context read")
    const later = scope.createContext()
    try {
      eq(await readTranscript(later, "e1"), { text: TEXT_E1 },
        "transcript must persist in the scope, readable from a later context")
      eq(await readTranscript(later, "never-transcribed"), null, "unknown episode reads null")
    } finally {
      await later.close()
    }
  })
})

await check("b3-error-class-stops-immediately", async () => {
  await session({ e2: ["fail:invalid-audio", "unreachable text"] }, async ({ ctx, calls, waits }) => {
    const result = await runBackfill(ctx, ["e2"], 5)
    eq(result.done, [], "done list")
    eq(result.failed, [{ episodeId: "e2", attempts: 1, code: "invalid-audio" }],
      "non-retryable class fails the episode with attempts 1 and its code")
    eq(calls.length, 1, "vendor called exactly once for a non-retryable error class")
    eq(waits.length, 0, "no backoff after a non-retryable failure")
    eq(await readTranscript(ctx, "e2"), null, "failed episode stores nothing")
  })
})

await check("b4-exhaustion-counts-vendor-calls", async () => {
  await session({ e3: ["busy", "busy", "busy", "busy", "busy"] }, async ({ ctx, calls }) => {
    const result = await runBackfill(ctx, ["e3"], 3)
    eq(result.failed, [{ episodeId: "e3", attempts: 3, code: "vendor-busy" }], "failed entry")
    eq(calls.length, 3, "maxAttempts 3 means exactly 3 vendor calls, then stop")
    eq(await readTranscript(ctx, "e3"), null, "exhausted episode stores nothing")
  })
})

await check("b5-mixed-batch-isolation", async () => {
  const goodText = "b5 transcript: healthy episode unaffected by sibling failure"
  await session(
    { bad: ["fail:invalid-audio"], good: ["busy", goodText] },
    async ({ ctx, calls }) => {
      const result = await runBackfill(ctx, ["bad", "good"], 4)
      eq(result.done, ["good"], "done list")
      eq(result.failed, [{ episodeId: "bad", attempts: 1, code: "invalid-audio" }], "failed list")
      eq(calls, [{ episodeId: "bad" }, { episodeId: "good" }, { episodeId: "good" }],
        "per-episode vendor call log")
      eq(await readTranscript(ctx, "good"), { text: goodText }, "good transcript stored")
    },
  )
})

await check("b6-vendor-edge-traced-per-attempt", async () => {
  const trace = tracer()
  await session({ e1: ["busy", "busy", TEXT_E1] }, async ({ ctx, calls }) => {
    await runBackfill(ctx, ["e1"], 5)
    const vendorSpans = trace.names.filter((name) => name === "speech.transcribe")
    eq(vendorSpans.length, calls.length,
      "every vendor call must be a traced execution named speech.transcribe (3 for busy,busy,ok)")
    eq(vendorSpans.length, 3, "3 traced vendor executions")
  }, [trace.extension])
})

await check("b7-attempt-ledger-matches-script", async () => {
  const ledger = mod.attemptLedger()
  assert(ledger && typeof ledger.counts === "function" && ledger.extension,
    "attemptLedger() must return { extension, counts }")
  await session({ e1: ["busy", "busy", TEXT_E1] }, async ({ ctx }) => {
    await runBackfill(ctx, ["e1"], 5)
    eq(ledger.counts()["speech.transcribe"], { started: 3, succeeded: 1, failed: 2 },
      "ledger for speech.transcribe under busy,busy,ok")
  }, [ledger.extension])
})

await check("s1-prepare-staging-site-present", async () => {
  // Honest proxy (see header): prepare() leaves no runtime once-staged signal, so the
  // machine floor is a static staging-site scan; the answer key's DO section requires the
  // reviewer to quote the single prepare site and the re-execution loop around step.exec().
  const sources = readdirSync("./src").filter((name) => name.endsWith(".ts"))
  assert(sources.length > 0, "no TypeScript sources under src/")
  const staged = sources.filter((name) => readFileSync(join("./src", name), "utf8").includes(".prepare("))
  assert(staged.length > 0, "no .prepare( staging site found in src/ — retry must re-execute a staged invocation")
})

const failed = Object.values(checks).filter((v) => v === "fail").length
console.log(JSON.stringify({ checks, errors, failed }, null, 2))
process.exit(failed > 0 ? 1 : 0)
