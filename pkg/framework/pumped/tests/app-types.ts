import { tag, type Lite } from "@pumped-fn/lite"
import { app } from "../src/app"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false
type Assert<T extends true> = T

const region = tag<string>({ label: "region" })
const configured = app({
  tags: [region("east")],
  extensions: [{ name: "trace" }],
})
const derived: Lite.Tagged<string> = configured.tags[0]

type ExtensionName = Assert<Equal<typeof configured.extensions[0]["name"], "trace">>

export type AppTypeContracts = ExtensionName
export { configured, derived }
