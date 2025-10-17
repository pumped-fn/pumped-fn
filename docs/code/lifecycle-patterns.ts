import { test, expect, vi } from 'vitest'
import { provide, derive, createScope } from '@pumped-fn/core-next'

// #region cleanup-basic
const database = provide((controller) => {
  const connection = {
    isConnected: true,
    query: async (sql: string) => ({ rows: [] }),
    disconnect: () => {
      connection.isConnected = false
    }
  }

  controller.cleanup(() => {
    connection.disconnect()
  })

  return connection
})
// #endregion cleanup-basic

// #region cleanup-multiple
const fileProcessor = provide((controller) => {
  const fileHandles: string[] = []
  const timers: NodeJS.Timeout[] = []

  const processor = {
    openFile: (path: string) => {
      fileHandles.push(path)
      return path
    },
    scheduleTask: (task: () => void, delay: number) => {
      const timer = setTimeout(task, delay)
      timers.push(timer)
      return timer
    },
    getOpenFiles: () => fileHandles.length,
    getActiveTimers: () => timers.length
  }

  controller.cleanup(() => {
    fileHandles.forEach(handle => {
      console.log(`Closing file: ${handle}`)
    })
    fileHandles.length = 0
  })

  controller.cleanup(() => {
    timers.forEach(timer => clearTimeout(timer))
    timers.length = 0
  })

  return processor
})
// #endregion cleanup-multiple

test('cleanup-basic: database connection cleanup', async () => {
  const scope = createScope()

  const db = await scope.resolve(database)
  expect(db.isConnected).toBe(true)

  await scope.dispose()
  expect(db.isConnected).toBe(false)
})

test('cleanup-multiple: multiple cleanup handlers', async () => {
  const scope = createScope()

  const processor = await scope.resolve(fileProcessor)

  processor.openFile('/data/file1.txt')
  processor.openFile('/data/file2.txt')
  processor.scheduleTask(() => {}, 1000)
  processor.scheduleTask(() => {}, 2000)

  expect(processor.getOpenFiles()).toBe(2)
  expect(processor.getActiveTimers()).toBe(2)

  await scope.dispose()

  expect(processor.getOpenFiles()).toBe(0)
  expect(processor.getActiveTimers()).toBe(0)
})

test('cleanup executes in reverse registration order', async () => {
  const cleanupOrder: number[] = []

  const resource = provide((controller) => {
    controller.cleanup(() => cleanupOrder.push(1))
    controller.cleanup(() => cleanupOrder.push(2))
    controller.cleanup(() => cleanupOrder.push(3))
    return {}
  })

  const scope = createScope()
  await scope.resolve(resource)
  await scope.dispose()

  expect(cleanupOrder).toEqual([3, 2, 1])
})

test('cleanup with reactive dependencies', async () => {
  const cleanupCallback = vi.fn()

  const counter = provide(() => 0)
  const watcher = derive(counter.reactive, (count, controller) => {
    controller.cleanup(cleanupCallback)
    return count
  })

  const scope = createScope()
  await scope.resolve(watcher)

  const initialCallCount = cleanupCallback.mock.calls.length

  await scope.update(counter, 1)
  expect(cleanupCallback).toHaveBeenCalledTimes(initialCallCount + 1)

  await scope.update(counter, 2)
  expect(cleanupCallback).toHaveBeenCalledTimes(initialCallCount + 2)

  await scope.dispose()
  expect(cleanupCallback).toHaveBeenCalledTimes(initialCallCount + 3)
})

test('async cleanup handlers', async () => {
  const cleanupLog: string[] = []

  const asyncResource = provide((controller) => {
    controller.cleanup(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      cleanupLog.push('async-cleanup-complete')
    })
    return { value: 'test' }
  })

  const scope = createScope()
  await scope.resolve(asyncResource)

  await scope.dispose()
  expect(cleanupLog).toEqual(['async-cleanup-complete'])
})
