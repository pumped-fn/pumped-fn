#!/usr/bin/env -S node --import tsx
import { main } from "../src/main"
import { option, splitRuntimeArgs, startupOption } from "./options"

const { runtime, rest } = splitRuntimeArgs(process.argv.slice(2))

await main({
  ...runtime,
  startup: startupOption(option(rest, "--startup")),
})
