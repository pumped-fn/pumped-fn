import { describe, expect, it } from "vitest"
import { createScope } from "@pumped-fn/lite"
import {
  CliWorkerError,
  cliWorker,
  runCli,
  step,
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

  it("marks generic CLI workers", () => {
    expect(step.find(cliWorker({ name: "x", command: "printf" })).kind).toBe("cli")
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
