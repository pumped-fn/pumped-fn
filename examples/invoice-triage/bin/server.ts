#!/usr/bin/env -S node --import tsx
import { startInvoiceServer } from "../src/server"
import { numberOption, option, runtimeExtensions, runtimeTags, splitRuntimeArgs, startupOption } from "./runtime"

const { runtime, rest } = splitRuntimeArgs(process.argv.slice(2))

await startInvoiceServer({
  extensions: runtimeExtensions(),
  tags: runtimeTags(runtime),
  startup: startupOption(option(rest, "--startup")),
  port: numberOption(rest, "--port", 3000),
  hostname: option(rest, "--host") ?? "127.0.0.1",
})
