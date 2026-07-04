import { createScope, type Lite } from "@pumped-fn/lite"
import { backend as schedulerBackend, inProcess } from "@pumped-fn/lite-extension-scheduler"
import { normalizeApp, type Manifest } from "./manifest"

export const defaultSchedulerBackend = inProcess()

export function createAppScope(manifest: Manifest, extraExtensions: Lite.Extension[] = []): Lite.Scope {
  const appConfig = normalizeApp(manifest.app)
  const tags =
    schedulerBackend.find(appConfig.tags) === undefined
      ? [...appConfig.tags, schedulerBackend(defaultSchedulerBackend)]
      : appConfig.tags

  return createScope({
    extensions: [...extraExtensions, ...appConfig.extensions],
    tags,
    presets: appConfig.presets,
  })
}
