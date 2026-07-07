import { describe, expect, it } from "vitest"
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createScope } from "@pumped-fn/lite"
import {
  CliWorkerError,
  claudeHarness,
  claudeCliWorker,
  cliWorker,
  codexHarness,
  codexCliWorker,
  guard,
  runCli,
  step,
  type ModelRequest,
} from "@pumped-fn/sdk"

describe("CLI workers", () => {
  it("runs a real CLI worker", async () => {
    const cli = cliWorker<{ text: string }, string>({
      name: "printf",
      command: "printf",
      args: (input) => ["%s", input.text],
      timeoutMs: 5_000,
    })
    const scope = createScope()
    const ctx = scope.createContext()
    expect(await ctx.exec({ flow: cli, input: { text: "sdk-cli-ok" } })).toBe("sdk-cli-ok")
    await ctx.close()
  })

  it("marks CLI-backed LLM helpers as LLM workers", () => {
    expect(step.find(cliWorker({ name: "x", command: "printf" })).kind).toBe("cli")
    expect(step.find(claudeCliWorker()).kind).toBe("llm")
    expect(step.find(codexCliWorker()).kind).toBe("llm")
  })

  it("passes LLM helper prompts after one argv terminator", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    expect(await ctx.exec({
      flow: claudeCliWorker({ command: "echo", extraArgs: ["--verbose"] }),
      input: { prompt: "--help" },
    })).toBe("-p --verbose -- --help")
    expect(await ctx.exec({
      flow: codexCliWorker({ command: "echo", extraArgs: ["--verbose"] }),
      input: { prompt: "--help" },
    })).toBe("exec -s read-only --verbose -- --help")

    await ctx.close()
  })

  it("rejects argv terminators in LLM helper extra args", async () => {
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: claudeCliWorker({ command: "echo", extraArgs: ["--"] }),
      input: { prompt: "x" },
    })).rejects.toThrow("CLI helper extraArgs cannot include --")

    await ctx.close({ ok: false, error: new Error("expected") })
  })

  it("rejects bare Claude harness args", () => {
    expect(() => claudeCliWorker({ extraArgs: ["--bare"] })).toThrow("Claude harness must not use --bare")
    expect(() => claudeCliWorker({ extraArgs: ["--bare=true"] })).toThrow("Claude harness must not use --bare")
    expect(() => claudeHarness({ extraArgs: ["--bare"] })).toThrow("Claude harness must not use --bare")
  })

  it("wraps isolated CLI runs with bubblewrap args", async () => {
    const isolated = await runCli({
      command: "printf",
      args: ["ok"],
      isolate: {
        bwrap: "echo",
        workdir: "/work",
        home: "/home/agent",
        network: true,
        bind: [{ source: "/source", target: "/target", mode: "rw" }],
      },
    })
    expect(isolated.stdout).toContain("--share-net")
    expect(isolated.stdout).not.toContain("--ro-bind /etc /etc")
    expect(isolated.stdout).not.toContain("--ro-bind /opt /opt")
    await expect(runCli({
      command: "printf",
      args: ["ok"],
      isolate: {
        bwrap: "echo",
        workdir: "/work",
        home: "/home/agent",
        bind: [{ source: "/source", target: "/target", mode: "rw" }],
      },
    })).resolves.toMatchObject({
      stdout: expect.stringContaining("--bind /source /target"),
    })
  })

  it("collects the first harness guard into material state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pumped-fn-model-"))
    const command = join(dir, "model")
    await writeFile(command, "#!/bin/sh\nprintf '%s' '{\"content\":\"ready\",\"guard\":\"Keep changes scoped\"}'\n")
    await chmod(command, 0o755)
    const store = guard("review-guard")
    const scope = createScope()
    const ctx = scope.createContext()
    const request = {
      agentName: "review",
      instructions: "Review the change.",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    } satisfies ModelRequest

    await expect(ctx.exec({ flow: codexHarness({ command, isolate: false, guard: store }), input: request }))
      .resolves.toMatchObject({
        content: "ready",
        guard: "Keep changes scoped",
        stop: true,
      })
    await expect(ctx.resolve(store)).resolves.toMatchObject({
      state: { text: "Keep changes scoped" },
    })

    await ctx.close()
    await scope.dispose()
    await rm(dir, { recursive: true, force: true })
  })

  it("passes collected guards to later harness prompts", async () => {
    const store = guard("planner-guard")
    const scope = createScope()
    const ctx = scope.createContext()
    const seen: string[] = []
    const request = {
      agentName: "planner",
      instructions: "Plan the work.",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    } satisfies ModelRequest
    const model = claudeHarness({
      command: "echo",
      isolate: false,
      guard: store,
      prompt: (_request, guard) => {
        seen.push(guard.text)
        return `guard=${guard.text}`
      },
      parse: () => seen.length === 1
        ? { content: "ready", guard: "Avoid single-model truth", stop: true }
        : { content: "ready", stop: true },
    })

    await ctx.exec({ flow: model, input: request })
    await ctx.exec({ flow: model, input: request })
    expect(seen).toEqual(["", "Avoid single-model truth"])

    await ctx.close()
    await scope.dispose()
  })

  it("adapts Codex and Claude CLI harnesses into models", async () => {
    const scope = createScope()
    const ctx = scope.createContext()
    const request = {
      agentName: "review",
      instructions: "Review the change.",
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    } satisfies ModelRequest

    await expect(ctx.exec({ flow: claudeHarness({ command: "echo", isolate: false }), input: request }))
      .resolves.toMatchObject({
        content: expect.stringContaining("-p --no-session-persistence -- Return JSON only."),
        stop: true,
      })
    await expect(ctx.exec({ flow: codexHarness({ command: "echo", isolate: false }), input: request }))
      .resolves.toMatchObject({
        content: expect.stringContaining("exec -s read-only --ephemeral --ignore-user-config -- Return JSON only."),
        stop: true,
      })

    await ctx.close()
    await scope.dispose()
  })

  it("reports CLI failures with captured stderr", async () => {
    const cli = cliWorker({
      name: "sh-fail",
      command: "sh",
      args: ["-c", "echo bad >&2; exit 7"],
    })
    const scope = createScope()
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: cli, input: { prompt: "" } })).rejects.toMatchObject({
      name: "CliWorkerError",
      result: { exitCode: 7, stderr: "bad\n" },
    } satisfies Partial<CliWorkerError>)
    await ctx.close({ ok: false, error: new Error("expected") })
  })
})
