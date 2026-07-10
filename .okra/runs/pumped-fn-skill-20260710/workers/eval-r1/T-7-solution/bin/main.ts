import { createScope } from "@pumped-fn/lite"
import { generateRound, listRounds } from "../src/tournament.js"

const scope = createScope()
const session = scope.createContext()

await session.exec({
  flow: generateRound,
  input: { entrants: [{ id: "ada", points: 2 }, { id: "bea", points: 2 }, { id: "cam", points: 1 }, { id: "dan", points: 0 }] },
})
await session.exec({
  flow: generateRound,
  input: { entrants: [{ id: "ada", points: 3 }, { id: "bea", points: 2 }, { id: "cam", points: 1 }, { id: "dan", points: 1 }] },
})

console.log(JSON.stringify(await session.exec({ flow: listRounds })))
await session.close({ ok: true })
await scope.dispose()
