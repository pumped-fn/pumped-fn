/**
 * Shared tag definitions for HTTP server examples
 * Tags provide compile-time type safety for runtime data access
 */

import { tag, custom } from '@pumped-fn/core-next'

export type AppConfig = {
  port: number
  env: 'development' | 'production'
  dbHost: string
}

export type DB = {
  query: (sql: string, params: any[]) => Promise<any>
  close: () => Promise<void>
}

export const appConfig = tag(custom<AppConfig>(), {
  label: 'app.config',
  default: {
    port: 3000,
    env: 'development',
    dbHost: 'localhost'
  }
})

export const requestId = tag(custom<string>(), {
  label: 'request.id'
})

export const userId = tag(custom<string>(), {
  label: 'user.id'
})

export const logger = tag(custom<Console>(), {
  label: 'app.logger',
  default: console
})
