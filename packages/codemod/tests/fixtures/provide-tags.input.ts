import { provide, tag } from "@pumped-fn/core-next"

const nameTag = tag<string>("name")
const versionTag = tag<string>("version")

const dbAtom = provide((ctl) => createDatabase(), nameTag("db"), versionTag("1.0"))
const singleTagAtom = provide((controller) => getValue(), nameTag("single"))
