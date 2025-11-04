import type { Core } from '@pumped-fn/core-next'
import type { tenantActor } from './actor.tenant'

type TenantActor = Core.InferOutput<ReturnType<typeof tenantActor>>

export async function waitForProcessing(
  actor: TenantActor,
  expectedCount: number,
  timeoutMs = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (actor.getTodos().length === expectedCount) {
      await new Promise(resolve => setImmediate(resolve))
      return
    }
    await new Promise(resolve => setImmediate(resolve))
  }

  throw new Error(
    `Timeout waiting for todo count ${expectedCount}, got ${actor.getTodos().length}`
  )
}

export async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (condition()) {
      await new Promise(resolve => setImmediate(resolve))
      return
    }
    await new Promise(resolve => setImmediate(resolve))
  }

  throw new Error(`Timeout waiting for condition`)
}
