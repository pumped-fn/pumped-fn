import { Bash } from "just-bash"
import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import { sandbox as agentSandbox } from "@pumped-fn/agent-sdk"
import { expect, it } from "vitest"
import { createSandbox, sandbox } from "../src/index"

it("provides sandbox capabilities through a lazy agent sandbox tag", async () => {
  const readPackage = flow({
    name: "read-package",
    parse: typed<{ path: string }>(),
    deps: { sandbox: tags.required(agentSandbox) },
    factory: (ctx, deps) => deps.sandbox.readFile(ctx.input.path),
  })
  const scope = createScope({
    tags: [
      sandbox({
        options: {
          files: {
            "/workspace/package.json": "{\"name\":\"demo\"}\n",
          },
          cwd: "/workspace",
        },
      }),
    ],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: readPackage,
    input: { path: "package.json" },
  })).resolves.toBe("{\"name\":\"demo\"}\n")

  await ctx.close()
  await scope.dispose()
})

it("does not create Bash until a sandbox capability is used", async () => {
  let created = 0
  const target = createSandbox({
    create: () => {
      created++
      return new Bash({ files: { "/workspace/value.txt": "ready" }, cwd: "/workspace" })
    },
  })

  expect(created).toBe(0)
  await expect(target.readFile("value.txt")).resolves.toBe("ready")
  expect(created).toBe(1)
  await expect(target.exec("printf", ["ok"])).resolves.toMatchObject({ stdout: "ok" })
  expect(created).toBe(1)
})

it("can be replaced per execution context without rebuilding flows", async () => {
  const runCheck = flow({
    name: "run-check",
    parse: typed<{ command: string; args?: readonly string[] }>(),
    deps: { sandbox: tags.required(agentSandbox) },
    factory: async (ctx, deps) => (await deps.sandbox.exec(ctx.input.command, ctx.input.args)).stdout,
  })
  const scope = createScope({
    tags: [
      sandbox({
        options: { cwd: "/workspace" },
      }),
    ],
  })
  const realCtx = scope.createContext()
  const fakeCtx = scope.createContext({
    tags: [
      agentSandbox({
        readFile: () => "",
        writeFile: () => undefined,
        exec: () => ({ stdout: "fake\n", stderr: "", exitCode: 0 }),
      }),
    ],
  })

  await expect(realCtx.exec({
    flow: runCheck,
    input: { command: "printf", args: ["real"] },
  })).resolves.toBe("real")
  await expect(fakeCtx.exec({
    flow: runCheck,
    input: { command: "printf", args: ["real"] },
  })).resolves.toBe("fake\n")

  await realCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})
