#!/usr/bin/env -S node --import tsx
import { watchDirectory } from "../src/invoice-watcher"
import { option, runtimeExtensions, runtimeTags, splitRuntimeArgs } from "./invoice-runtime"

const { runtime, rest } = splitRuntimeArgs(process.argv.slice(2))

await watchDirectory({
  directory: option(rest, "--directory") ?? rest[0] ?? "inbox",
  extensions: runtimeExtensions(),
  tags: runtimeTags(runtime),
})
