import { runVerifier } from "./verify.js"

process.stdout.write(`${JSON.stringify(await runVerifier(), null, 2)}\n`)
