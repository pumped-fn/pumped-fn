import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { actorRegistry } from './resource.registry'

describe('Actor Registry', () => {
  test('spawns and retrieves tenant actors', async () => {
    const scope = createScope()
    const registry = await scope.resolve(actorRegistry)

    const actor1 = await registry.spawn('tenant-1')
    const actor2 = await registry.spawn('tenant-2')

    expect(registry.get('tenant-1')).toBe(actor1)
    expect(registry.get('tenant-2')).toBe(actor2)
    expect(registry.list()).toEqual(['tenant-1', 'tenant-2'])

    await scope.dispose()
  })

  test('idempotent spawn returns same actor instance', async () => {
    const scope = createScope()
    const registry = await scope.resolve(actorRegistry)

    const actor1 = await registry.spawn('tenant-1')
    const actor2 = await registry.spawn('tenant-1')

    expect(actor1).toBe(actor2)
    expect(registry.list()).toEqual(['tenant-1'])

    await scope.dispose()
  })

  test('kill removes actor and allows respawn', async () => {
    const scope = createScope()
    const registry = await scope.resolve(actorRegistry)

    const actor1 = await registry.spawn('tenant-1')
    expect(registry.get('tenant-1')).toBe(actor1)

    await registry.kill('tenant-1')
    expect(registry.get('tenant-1')).toBeUndefined()
    expect(registry.list()).toEqual([])

    const actor2 = await registry.spawn('tenant-1')
    expect(actor2).not.toBe(actor1)
    expect(registry.get('tenant-1')).toBe(actor2)

    await scope.dispose()
  })
})
