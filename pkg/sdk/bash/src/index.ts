import { Bash } from "just-bash"
import { sandbox as agentSandbox, type Sandbox } from "@pumped-fn/sdk"
import type { Lite } from "@pumped-fn/lite"
import { dirname } from "node:path/posix"

export type BashOptions = ConstructorParameters<typeof Bash>[0]

export interface JustBashOptions {
  bash?: Bash
  create?: () => Bash
  options?: BashOptions
}

export function sandbox(options: JustBashOptions = {}): Lite.Tagged<Sandbox> {
  return agentSandbox(createSandbox(options))
}

export function createSandbox(options: JustBashOptions = {}): Sandbox {
  let bash: Bash | undefined
  const run = () => {
    bash ??= options.bash ?? options.create?.() ?? new Bash(options.options)
    return bash
  }
  return {
    async readFile(path) {
      const result = await run().exec(`cat ${quote(path)}`)
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `readFile failed for ${path}`)
      return result.stdout
    },
    async writeFile(path, content) {
      const result = await run().exec(`mkdir -p ${quote(dirname(path))} && cat > ${quote(path)}`, { stdin: content })
      if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `writeFile failed for ${path}`)
    },
    async exec(command, args = []) {
      const result = await run().exec([command, ...args].map(quote).join(" "))
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    },
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}
