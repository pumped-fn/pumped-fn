/** Project configuration loaded by the `pumped` binary from pumped.config.ts. */
export interface PumpedConfig {
  dir?: string
  app?: string
  port?: number
  vite?: import("vite").UserConfig
}

export function defineConfig(config: PumpedConfig): PumpedConfig {
  return config
}
