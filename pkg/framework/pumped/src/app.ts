import { normalizePickInput, normalizeTagInput, type AppConfig } from "./runtime/manifest"

/**
 * Defines an application composition without creating a scope or starting work.
 * A second argument derives a new composition from a base app.
 */
export function app(): AppConfig
export function app<const Config extends AppConfig>(config: Config): Config
export function app(base: AppConfig, additions: AppConfig): AppConfig
export function app(base: AppConfig = {}, additions?: AppConfig): AppConfig {
  if (!additions) return { ...base }

  return {
    presets: [...(base.presets ?? []), ...(additions.presets ?? [])],
    tags: [...normalizeTagInput(additions.tags), ...normalizeTagInput(base.tags)],
    extensions: [...(base.extensions ?? []), ...(additions.extensions ?? [])],
    attributes: {
      include: [...normalizePickInput(additions.attributes?.include), ...normalizePickInput(base.attributes?.include)],
      exclude: [...normalizePickInput(additions.attributes?.exclude), ...normalizePickInput(base.attributes?.exclude)],
    },
  }
}
