#!/usr/bin/env node

const args = process.argv.slice(2)
let socketPath: string | undefined

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--socket" && args[i + 1]) {
    socketPath = args[i + 1]
    i++
  }
}

console.log("Pumped-FN Devtools CLI")
if (socketPath) {
  console.log(`Socket path: ${socketPath}`)
}
