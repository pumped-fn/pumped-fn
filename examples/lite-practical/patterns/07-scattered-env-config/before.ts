export interface LegacyConfig {
  readonly apiBaseUrl: string
  readonly cleanupMinutes: number
  readonly httpPort: number
  readonly workerBatchSize: number
}

export function readHttpPort(env: NodeJS.ProcessEnv = process.env): number {
  return parseInt(env["PORT"] ?? "3000", 10) || 3000
}

export function readWorkerBatchSize(env: NodeJS.ProcessEnv = process.env): number {
  return Number(env["WORKER_BATCH_SIZE"] ?? "100") || 100
}

export function readCleanupMinutes(env: NodeJS.ProcessEnv = process.env): number {
  return parseInt(env["CLEANUP_MINUTES"] ?? "15", 10) || 15
}

export function buildLegacyConfig(env: NodeJS.ProcessEnv = process.env): LegacyConfig {
  return {
    apiBaseUrl: env["API_BASE_URL"] ?? "http://localhost",
    cleanupMinutes: readCleanupMinutes(env),
    httpPort: readHttpPort(env),
    workerBatchSize: readWorkerBatchSize(env),
  }
}
