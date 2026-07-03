interface BootConfig {
  close(): Promise<void>
}

interface Pool {
  end(): Promise<void>
}

interface Server {
  close(): Promise<void>
}

interface Runtime {
  readonly config: BootConfig
  readonly pool: Pool
  readonly server: Server
}

export function createManualShutdown(runtime: Runtime): () => Promise<void> {
  return async () => {
    await runtime.server.close()
    await runtime.pool.end()
    await runtime.config.close()
  }
}

export function installShutdownHandler(runtime: Runtime, onSignal: (handler: () => Promise<void>) => void): void {
  const shutdown = createManualShutdown(runtime)
  onSignal(shutdown)
}
