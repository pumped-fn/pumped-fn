/**
 * @file reactive-updates.ts
 * Reactive executors and scope updates
 *
 * Demonstrates:
 * - Using derive.reactive for live updates
 * - scope.update() to trigger re-execution
 * - Reactive vs non-reactive behavior
 *
 * Verify: pnpm -F @pumped-fn/examples typecheck
 * Run: pnpm -F @pumped-fn/examples dev:reactive-updates
 */

import { provide, derive, createScope, Promised } from '@pumped-fn/core-next'
import { appConfig } from './shared/tags'

const config = provide((controller) => appConfig.get(controller.scope))

const cachedData = derive(config, (cfg) => ({
  environment: cfg.env,
  timestamp: Date.now()
}))

const reactiveConsumer = derive.reactive(cachedData, (data) => {
  console.log('Config changed:', data)
  return data
})

async function main() {
  const scope = createScope({
    tags: [
      appConfig({
        port: 3000,
        env: 'development',
        dbHost: 'localhost'
      })
    ]
  })

  const consumer = await scope.resolve(reactiveConsumer)
  console.log('Initial:', consumer)

  scope.update(appConfig({
    port: 3000,
    env: 'production',
    dbHost: 'prod.db.example.com'
  }))

  await new Promise(resolve => setTimeout(resolve, 100))
  await scope.dispose()
}

Promised.try(main).catch((error) => {
  console.error(error)
  process.exit(1)
})
