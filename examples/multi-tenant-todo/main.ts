import { createScope, Promised, type Core } from '@pumped-fn/core-next'
import { tenantActor } from './actor.tenant'

type TenantActor = Core.InferOutput<ReturnType<typeof tenantActor>>

async function waitForProcessing(
  actor: TenantActor,
  expectedCount: number,
  timeoutMs = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeoutMs) {
    if (actor.getTodos().length === expectedCount) {
      return
    }
    await new Promise(resolve => setImmediate(resolve))
  }

  throw new Error(
    `Timeout waiting for todo count ${expectedCount}, got ${actor.getTodos().length}`
  )
}

async function main() {
  console.log('Multi-Tenant Todo Actor System\n')

  const scope = createScope()

  console.log('Creating tenant actors...')
  const tenant1 = await scope.resolve(tenantActor('tenant-alice'))
  const tenant2 = await scope.resolve(tenantActor('tenant-bob'))
  console.log('Tenants: alice, bob')
  console.log()

  console.log('Alice creates todos...')
  tenant1.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Buy groceries' }
  })

  tenant1.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-2', title: 'Write code' }
  })

  console.log('Bob creates todos...')
  tenant2.send({
    type: 'CREATE_TODO',
    payload: { id: 'todo-1', title: 'Review PR' }
  })

  await waitForProcessing(tenant1, 2)
  await waitForProcessing(tenant2, 1)

  console.log('\nAlice todos:', tenant1.getTodos())
  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nAlice completes a todo...')
  tenant1.send({
    type: 'UPDATE_TODO',
    payload: { id: 'todo-1', completed: true }
  })

  await waitForProcessing(tenant1, 2)

  console.log('Alice todos:', tenant1.getTodos())

  console.log('\nBob deletes a todo...')
  tenant2.send({
    type: 'DELETE_TODO',
    payload: { id: 'todo-1' }
  })

  await waitForProcessing(tenant2, 0)

  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nCleaning up...')
  await scope.dispose()
  console.log('Done!')
}

Promised.try(main).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
