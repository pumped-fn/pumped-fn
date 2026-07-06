#!/usr/bin/env -S node --import tsx
import { main } from "../src/invoice-main"
import { option, splitRuntimeArgs, startupOption } from "./invoice-runtime"

const { runtime, rest } = splitRuntimeArgs(process.argv.slice(2))

await main({
  ...runtime,
  startup: startupOption(option(rest, "--startup")),
})
