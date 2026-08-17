#!/usr/bin/env node

import { main } from "../dist/cli.mjs"

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
