import { createScope, Promised } from '@pumped-fn/core-next'
import { actorRegistry } from './resource.registry'

async function main() {
  console.log('Multi-Tenant Todo Actor System\n')

  const scope = createScope()
  const registry = await scope.resolve(actorRegistry)

  console.log('Spawning tenant actors...')
  const tenant1 = await registry.spawn('tenant-alice')
  const tenant2 = await registry.spawn('tenant-bob')

  console.log('Active tenants:', registry.list())
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

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('\nAlice todos:', tenant1.getTodos())
  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nAlice completes a todo...')
  tenant1.send({
    type: 'UPDATE_TODO',
    payload: { id: 'todo-1', completed: true }
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('Alice todos:', tenant1.getTodos())

  console.log('\nBob deletes a todo...')
  tenant2.send({
    type: 'DELETE_TODO',
    payload: { id: 'todo-1' }
  })

  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('Bob todos:', tenant2.getTodos())

  console.log('\nCleaning up...')
  await scope.dispose()
  console.log('Done!')
}

Promised.try(main).catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
