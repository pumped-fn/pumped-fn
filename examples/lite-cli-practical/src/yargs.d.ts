declare module "yargs" {
  export interface PositionalOptions {
    type: "string"
    demandOption?: boolean
  }

  export interface OptionOptions {
    type: "string" | "boolean"
    choices?: readonly string[]
    default?: string | boolean
    demandOption?: boolean
  }

  export type Builder = (cmd: Argv) => Argv
  export type Handler<T extends object> = (argv: T) => unknown | Promise<unknown>

  export interface Argv {
    scriptName(name: string): Argv
    exitProcess(enabled: boolean): Argv
    command<T extends object>(command: string, description: string, builder: Builder, handler: Handler<T>): Argv
    positional(name: string, options: PositionalOptions): Argv
    option(name: string, options: OptionOptions): Argv
    strict(): Argv
    help(): Argv
    parseAsync(args: readonly string[]): Promise<unknown>
  }

  export default function yargs(args?: readonly string[]): Argv
}
