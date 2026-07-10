import { createScope } from "@pumped-fn/lite"
import { generateRound, listRounds } from "../src/tournament.ts"

const entrants = [
  { id: "anna", points: 3 },
  { id: "boris", points: 2 },
  { id: "carl", points: 1 },
  { id: "dina", points: 1 },
  { id: "elke", points: 0 },
]

const scope = createScope()
const session = scope.createContext()
await session.exec({ flow: generateRound, input: { entrants } })
await session.exec({ flow: generateRound, input: { entrants: entrants.slice(0, 4) } })
const rounds = await session.exec({ flow: listRounds })
console.log(JSON.stringify(rounds, null, 2))
await session.close()
await scope.dispose()
