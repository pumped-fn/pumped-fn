import { createScope, type Lite } from "@pumped-fn/lite"
import { normalizeApp, type Manifest } from "./manifest"

export function createAppScope(manifest: Manifest, extraExtensions: Lite.Extension[] = []): Lite.Scope {
  const appConfig = normalizeApp(manifest.app)

  return createScope({
    extensions: [...extraExtensions, ...appConfig.extensions],
    tags: appConfig.tags,
    presets: appConfig.presets,
  })
}
