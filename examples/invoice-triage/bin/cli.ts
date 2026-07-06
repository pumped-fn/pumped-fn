#!/usr/bin/env -S node --import tsx
import { runCli } from "../src/invoice-cli"
import { runtimeExtensions, runtimeTags, splitRuntimeArgs } from "./invoice-runtime"

const { runtime, rest } = splitRuntimeArgs(process.argv.slice(2))

process.exitCode = await runCli(rest, {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
}, {
  extensions: runtimeExtensions(),
  tags: runtimeTags(runtime),
})
