import { runVerifier } from "../tests/support/verifier.js"

process.stdout.write(`${JSON.stringify(await runVerifier(), null, 2)}\n`)
