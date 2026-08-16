import { FlowFault, ParseError, type Lite } from "@pumped-fn/lite"
import type { Manifest } from "../runtime/manifest"
import { cliInvocation, command, type CommandSpec } from "../tags"
import { HostStartError, selectEntries, type Host, type HostRuntime, type HostSelection } from "./host"

/** Output sinks supplied by callers that embed or test the generated CLI. */
export interface CliIo {
  out(line: string): void
  err(line: string): void
}

export interface CliRuntime extends HostRuntime {
  code: Promise<number>
}

interface MountedCommand {
  spec: CommandSpec
  tagged: Lite.Tagged<any>
  selection: HostSelection<CommandSpec>
}

function usage(commands: readonly MountedCommand[]): string[] {
  return [
    "Usage: <command> [--json <payload>]",
    "",
    "Commands:",
    ...commands.map(({ spec }) => (spec.description ? `  ${spec.name}  ${spec.description}` : `  ${spec.name}`)),
  ]
}

export const cliHost: Host<CommandSpec, { argv: readonly string[]; io?: CliIo }, CliRuntime> = Object.freeze({
  name: "cli",
  selector: command,
  provides: Object.freeze([cliInvocation]),
  start({ scope, manifest, argv, io }: { scope: Lite.Scope; manifest: Manifest; argv: readonly string[]; io?: CliIo }): CliRuntime {
    const out = io?.out ?? ((line: string) => process.stdout.write(`${line}\n`))
    const err = io?.err ?? ((line: string) => process.stderr.write(`${line}\n`))

    const commands: MountedCommand[] = []
    const names = new Map<string, string>()
    for (const selection of selectEntries(manifest, command)) {
      for (const mount of selection.mounts) {
        const existing = names.get(mount.spec.name)
        if (existing) {
          throw new HostStartError(
            "duplicate-command",
            `duplicate command "${mount.spec.name}": ${existing}, ${selection.name}`
          )
        }
        names.set(mount.spec.name, selection.name)
        commands.push({ spec: mount.spec, tagged: mount.tagged, selection })
      }
    }

    async function run(): Promise<number> {
      if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
        for (const line of usage(commands)) out(line)
        return 0
      }

      const [name, ...rest] = argv
      const mounted = commands.find((candidate) => candidate.spec.name === name)
      if (!mounted) {
        err(`unknown command "${name}"`)
        for (const line of usage(commands)) err(line)
        return 2
      }

      let rawInput: unknown
      for (let index = 0; index < rest.length; index++) {
        const arg = rest[index] as string
        const payload = arg === "--json" ? rest[++index] : arg.startsWith("--json=") ? arg.slice("--json=".length) : undefined
        if (payload === undefined) {
          err(arg.startsWith("--json") ? "--json requires a payload" : `unknown option "${arg}"`)
          return 2
        }
        try {
          rawInput = JSON.parse(payload)
        } catch (error) {
          err(`invalid --json payload: ${error instanceof Error ? error.message : String(error)}`)
          return 2
        }
      }

      const bundle = await scope.resolve(mounted.selection.entry)
      try {
        const output = await scope.run({
          flow: bundle.flow,
          rawInput,
          tags: [cliInvocation({ command: mounted.spec.name, argv }), mounted.tagged, mounted.selection.tags],
        })
        out(JSON.stringify(output))
        return 0
      } catch (error) {
        if (error instanceof ParseError) {
          err(error.message)
          return 2
        }
        if (error instanceof FlowFault) {
          err(JSON.stringify({ fault: error.fault }))
          return 3
        }
        err(error instanceof Error ? error.message : String(error))
        return 1
      }
    }

    const code = run().catch((error) => {
      err(error instanceof Error ? error.message : String(error))
      return 1
    })

    return {
      ready: code.then(() => undefined),
      stop: async () => {
        await code
      },
      code,
    }
  },
})
