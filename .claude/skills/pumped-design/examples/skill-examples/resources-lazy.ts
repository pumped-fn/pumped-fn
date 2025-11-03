/**
 * Lazy and Reactive Resource Examples
 *
 * Extracted from resource-lazy.md
 */

import { provide, derive, tag, name } from '@pumped-fn/core-next'

/**
 * Basic Reactive Counter
 *
 * Demonstrates reactive dependency pattern.
 *
 * Referenced in: resource-lazy.md
 * Section: Reactive Resources - Basic Pattern
 */
export const lazyReactiveCounter = (() => {
  const counter = provide(() => 0)

  const incrementedCounter = derive(
    counter.reactive,
    (count) => count + 1
  )

  return { counter, incrementedCounter }
})()

/**
 * Reactive Dependency Example
 *
 * Demonstrates reactive vs non-reactive behavior.
 *
 * Referenced in: resource-lazy.md
 * Section: Reactive Resources - Why .reactive?
 */
export const lazyReactiveDependency = (() => {
  const counter = provide(() => 0)

  const reactiveDoubled = derive(
    counter.reactive,
    (count) => count * 2
  )

  const nonReactiveDoubled = derive(
    counter,
    (count) => count * 2
  )

  return { counter, reactiveDoubled, nonReactiveDoubled }
})()

/**
 * Named Reactive Counter
 *
 * Reactive dependency with named resources.
 *
 * Referenced in: resource-lazy.md
 * Section: Example 1
 */
export const lazyNamedReactiveCounter = (() => {
  const counter = provide(() => 0, name("counter"))
  const incrementedCounter = derive(
    counter.reactive,
    (count) => {
      return count + 1
    },
    name("incrementedCounter")
  )

  return { counter, incrementedCounter }
})()

/**
 * Chained Reactive Dependencies
 *
 * Multiple levels of reactive dependencies.
 *
 * Referenced in: resource-lazy.md
 * Section: Example 2
 */
export const lazyChainedReactive = (() => {
  const counter = provide(() => 0)
  const incrementedCounter = derive(
    counter.reactive,
    (count) => count + 1
  )

  const doubleIncrementedCounter = derive(
    incrementedCounter.reactive,
    (count) => count + 1
  )

  return { counter, incrementedCounter, doubleIncrementedCounter }
})()

/**
 * Multiple Reactive Patterns
 *
 * Different ways to declare reactive dependencies.
 *
 * Referenced in: resource-lazy.md
 * Section: Example 3
 */
export const lazyMultipleReactivePatterns = (() => {
  const counter = provide(() => 0)

  const derivedCounter = derive(counter.reactive, (count) => count.toString())

  const derivedArrayCounter = derive([counter.reactive], (count, ctl) => {
    ctl.cleanup(() => {})
    return count.toString()
  })

  const derivedObjectCounter = derive(
    { counter: counter.reactive },
    ({ counter }) => counter.toString()
  )

  return { counter, derivedCounter, derivedArrayCounter, derivedObjectCounter }
})()

/**
 * Accessor Pattern
 *
 * Synchronous access to reactive resources.
 *
 * Referenced in: resource-lazy.md
 * Section: Accessor Pattern
 */
export const lazyAccessorPattern = (() => {
  const counter = provide(() => 0)
  const derived = derive(counter.reactive, (count) => count * 2)

  return { counter, derived }
})()

/**
 * Conditional Logger Resolution
 *
 * Demonstrates .lazy for environment-based conditional resolution.
 *
 * Referenced in: resource-lazy.md
 * Section: Lazy Dependencies - Example 1
 */
export const lazyConditionalLogger = (() => {
  const consoleLogger = provide(() => {
    console.log('Initializing console logger')
    return { log: (msg: string) => console.log(msg) }
  })

  const pinoLogger = provide(() => {
    console.log('Initializing pino logger')
    return { log: (msg: string) => console.log(`[PINO] ${msg}`) }
  })

  const appConfig = provide(() => ({
    env: process.env.NODE_ENV || 'development'
  }))

  const logger = derive(
    {
      console: consoleLogger.lazy,
      pino: pinoLogger.lazy,
      config: appConfig
    },
    async ({ console, pino, config }) => {
      if (config.env === 'development') {
        return await console.resolve()
      } else {
        return await pino.resolve()
      }
    }
  )

  return { consoleLogger, pinoLogger, appConfig, logger }
})()

/**
 * Logger with Tag Resolution
 *
 * Cleaner config handling using scope's tag resolution.
 *
 * Referenced in: resource-lazy.md
 * Section: Lazy Dependencies - Alternative
 */
export const lazyLoggerWithTags = (() => {
  const envTag = tag<string>()

  const consoleLogger = provide(() => ({ log: (msg: string) => console.log(msg) }))
  const pinoLogger = provide(() => ({ log: (msg: string) => console.log(`[PINO] ${msg}`) }))

  const logger = derive(
    { console: consoleLogger.lazy, pino: pinoLogger.lazy },
    async ({ console, pino }, ctl) => {
      const env = ctl.scope.tag(envTag) ?? 'development'
      return env === 'development'
        ? await console.resolve()
        : await pino.resolve()
    }
  )

  return { envTag, consoleLogger, pinoLogger, logger }
})()

/**
 * Optional Feature Flags
 *
 * Lazy loading expensive resources based on feature flags.
 *
 * Referenced in: resource-lazy.md
 * Section: Lazy Dependencies - Example 2
 */
export const lazyOptionalFeatures = (() => {
  const mlModel = provide(() => {
    console.log('Loading expensive ML model...')
    return { predict: (x: number) => x * 2 }
  })

  const featureFlags = provide(() => ({
    mlEnabled: false
  }))

  const predictionService = derive(
    {
      model: mlModel.lazy,
      flags: featureFlags
    },
    async ({ model, flags }) => {
      if (flags.mlEnabled) {
        const m = await model.resolve()
        return { predict: (x: number) => m.predict(x) }
      }
      return { predict: (x: number) => x }
    }
  )

  return { mlModel, featureFlags, predictionService }
})()

/**
 * Lazy Testing Pattern
 *
 * Reduce test pollution with lazy dependencies.
 *
 * Referenced in: resource-lazy.md
 * Section: Lazy Dependencies - Example 3
 */
export const lazyTestingPattern = (() => {
  const dbConnection = provide(() => {
    console.log('Connecting to database...')
    return { query: async () => [] }
  })

  const cacheConnection = provide(() => {
    console.log('Connecting to cache...')
    return { get: async () => null }
  })

  const userService = derive(
    {
      db: dbConnection.lazy,
      cache: cacheConnection.lazy
    },
    async ({ db, cache }) => {
      return {
        getUser: async (id: string, useCache: boolean) => {
          if (useCache) {
            const c = await cache.resolve()
            const cached = await c.get()
            if (cached) return cached
          }
          const d = await db.resolve()
          return await d.query()
        }
      }
    }
  )

  return { dbConnection, cacheConnection, userService }
})()

/**
 * Static Resources
 *
 * Immutable resources without reactivity overhead.
 *
 * Referenced in: resource-lazy.md
 * Section: Static Resources
 */
export const lazyStaticResources = (() => {
  const config = provide(() => ({
    apiUrl: 'https://api.example.com',
    timeout: 5000
  }))

  const apiClient = derive(
    config.static,
    (cfg) => ({ url: cfg.apiUrl, timeout: cfg.timeout })
  )

  return { config, apiClient }
})()
