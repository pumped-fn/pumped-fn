import { provide, tag } from "@pumped-fn/core-next"

const nameTag = tag<string>("name")
const versionTag = tag<string>("version")

const dbAtom = atom({
  factory: (ctx) => createDatabase(),
  tags: [nameTag("db"), versionTag("1.0")]
})
const singleTagAtom = atom({
  factory: (ctx) => getValue(),
  tags: [nameTag("single")]
})
