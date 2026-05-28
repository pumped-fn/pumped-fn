import { describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  CliWorkerError,
  claudeCliWorker,
  cliWorker,
  codexCliWorker,
  step,
} from "@pumped-fn/agent-sdk"

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
    expect(await ctx.exec({ flow: cli, input: { text: "agent-sdk-cli-ok" } })).toBe("agent-sdk-cli-ok")
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
