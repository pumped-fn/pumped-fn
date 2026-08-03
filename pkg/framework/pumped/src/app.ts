import { normalizeTagInput, type AppConfig } from "./runtime/manifest"

export * from "@pumped-fn/lite"

/**
 * Defines an application composition without creating a scope or starting work.
 * A second argument derives a new composition from a base app.
 */
export function app(): AppConfig
export function app<const Config extends AppConfig>(config: Config): Config
export function app(base: AppConfig, additions: AppConfig): AppConfig
export function app(base: AppConfig = {}, additions?: AppConfig): AppConfig {
  if (!additions) return base

  const baseContext = base.context
  const addedContext = additions.context
  const baseMapError = base.mapError
  const addedMapError = additions.mapError

  return {
    presets: [...(base.presets ?? []), ...(additions.presets ?? [])],
    tags: [...normalizeTagInput(additions.tags), ...normalizeTagInput(base.tags)],
    extensions: [...(base.extensions ?? []), ...(additions.extensions ?? [])],
    context: addedContext && baseContext
      ? (request) => [
          ...normalizeTagInput(addedContext(request)),
          ...normalizeTagInput(baseContext(request)),
        ]
      : addedContext ?? baseContext,
    mapError: addedMapError && baseMapError
      ? (error) => addedMapError(error) ?? baseMapError(error)
      : addedMapError ?? baseMapError,
  }
}
