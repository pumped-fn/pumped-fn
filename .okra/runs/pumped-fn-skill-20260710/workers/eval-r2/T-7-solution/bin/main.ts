import { createScope } from "@pumped-fn/lite"
import { generateRound, listRounds } from "../src/tournament.js"

const scope = createScope()
const session = scope.createContext()

await session.exec({
  flow: generateRound,
  input: { entrants: [
    { id: "alba", points: 2 },
    { id: "bryn", points: 2 },
    { id: "cato", points: 1 },
    { id: "dara", points: 1 },
  ] },
})
await session.exec({
  flow: generateRound,
  input: { entrants: [
    { id: "alba", points: 3 },
    { id: "bryn", points: 2 },
    { id: "cato", points: 2 },
    { id: "dara", points: 1 },
  ] },
})
console.log(JSON.stringify(await session.exec({ flow: listRounds })))
await session.close({ ok: true })
await scope.dispose()
