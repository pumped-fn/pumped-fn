/**
 * APM (Application Performance Monitoring) Integration Extension
 *
 * Integrates with external APM services for flow performance tracking.
 * Demonstrates: External service integration, transaction management, error resilience.
 *
 * Referenced in: .claude/skills/pumped-design/references/extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Integration
 */

import { extension, type Extension, type Core } from '@pumped-fn/core-next'

type APMClient = { startTransaction: (name: string) => APMTransaction }
type APMTransaction = { end: () => void; setError: (error: unknown) => void }
type APMStore = { client: APMClient; activeTransactions: Map<string, APMTransaction> }

const stateMap = new WeakMap<Core.Scope, APMStore>()

export const apmExtension = (client: APMClient) => extension({
  name: 'apm',

  init: (scope) => {
    stateMap.set(scope, {
      client,
      activeTransactions: new Map()
    })
  },

  wrap: (scope, next, operation) => {
    if (operation.kind !== 'execute') return next()

    const store = stateMap.get(scope)
    if (!store) return next()

    const transactionId = `${operation.definition.name}-${Date.now()}`

    let transaction: APMTransaction | undefined
    try {
      transaction = store.client.startTransaction(operation.definition.name)
      store.activeTransactions.set(transactionId, transaction)
    } catch (error) {
      // APM client failure should not break flows
      console.error('[apm] Failed to start transaction:', error)
      return next()
    }

    return next()
      .then((result) => {
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        return result
      })
      .catch((error) => {
        transaction?.setError(error)
        transaction?.end()
        store.activeTransactions.delete(transactionId)
        throw error
      })
  },

  dispose: async (scope) => {
    const store = stateMap.get(scope)
    if (!store) return

    // End all active transactions
    for (const [id, transaction] of store.activeTransactions) {
      try {
        transaction.end()
      } catch (error) {
        console.error(`[apm] Failed to end transaction ${id}:`, error)
      }
    }
    store.activeTransactions.clear()
    stateMap.delete(scope)
  }
} satisfies Extension.Extension)
