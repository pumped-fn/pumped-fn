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
})
