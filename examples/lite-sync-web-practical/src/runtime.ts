import { createScope, type Lite } from "@pumped-fn/lite"
import { sync } from "@pumped-fn/lite-extension-sync"
import { web, type Web } from "./web"

export function createBrowserScope(options: Web.EnvOptions): Lite.Scope {
  return createScope({
    extensions: [sync.extension()],
    tags: [sync.runtime(web.env(options))],
  })
}
