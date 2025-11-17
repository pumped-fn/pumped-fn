import { describe, expect, vi } from "vitest"
import {
  createScope,
  custom,
  derive,
  preset,
  provide,
  Promised,
  tag,
  tags,
} from "../src"
import { type Extension } from "../src/types"
import { resolves } from "../src/helpers"
import { validate } from "../src/ssch"
import { FactoryExecutionError, ExecutorResolutionError } from "../src/types"
import { scenario } from "./scenario"
import { createFlowHarness } from "./harness"

describe("edge behavior", () => {
  const harness = createFlowHarness()

  scenario("error handling and callbacks", async () => {
    await harness.error.expectExecutorError(
      harness.executors.failing("factory"),
      FactoryExecutionError,
    )

    const chain = harness.error.createFailingChain("Dependency error")
    const { scope, errorCallback } = harness.setup.scopeWithErrorHandler()
    await expect(scope.resolve(chain.chainedExecutor)).rejects.toThrow()
    expect(errorCallback).toHaveBeenCalledTimes(2)
    expect(errorCallback).toHaveBeenNthCalledWith(
      1,
      expect.any(FactoryExecutionError),
      chain.failingExecutor,
      scope,
    )
    expect(errorCallback).toHaveBeenNthCalledWith(
      2,
      expect.any(ExecutorResolutionError),
      chain.chainedExecutor,
      scope,
    )
    await scope.dispose()

    const multiCallbackScope = createScope()
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()
    multiCallbackScope.onError(firstCallback)
    multiCallbackScope.onError(secondCallback)
    await expect(
      multiCallbackScope.resolve(harness.executors.failing("boom")),
    ).rejects.toThrow()
    expect(firstCallback).toHaveBeenCalledTimes(1)
    expect(secondCallback).toHaveBeenCalledTimes(1)

    const perExecutorScope = createScope()
    const perCallback = vi.fn()
    const otherCallback = vi.fn()
    const target = harness.executors.failing("target")
    const other = harness.executors.failing("other")
    perExecutorScope.onError(target, perCallback)
    perExecutorScope.onError(other, otherCallback)
    await expect(perExecutorScope.resolve(target)).rejects.toThrow()
    expect(perCallback).toHaveBeenCalledTimes(1)
    expect(otherCallback).not.toHaveBeenCalled()

    const extensionHandler = vi.fn()
    const extension = harness.extensions.errorHandler(extensionHandler, "ext")
    const extensionScope = harness.setup.scopeWithExtensions([extension])
    await expect(
      extensionScope.resolve(harness.executors.failing("ext failure")),
    ).rejects.toThrow()
    expect(extensionHandler).toHaveBeenCalledTimes(1)

    const throwingExtension = vi.fn().mockImplementation(() => {
      throw new Error("extension")
    })
    const throwingScope = harness.setup.scopeWithExtensions([
      harness.extensions.errorHandler(throwingExtension, "thrower"),
    ])
    await expect(
      throwingScope.resolve(harness.executors.failing("original")),
    ).rejects.toThrow("original")
    expect(throwingExtension).toHaveBeenCalledTimes(1)

    const cleanupScope = createScope()
    const cleanupCallback = vi.fn()
    const cleanup = cleanupScope.onError(cleanupCallback)
    cleanup()
    await expect(
      cleanupScope.resolve(harness.executors.failing("after cleanup")),
    ).rejects.toThrow()
    expect(cleanupCallback).not.toHaveBeenCalled()

    const executorCleanupScope = createScope()
    const execCallback = vi.fn()
    const execCleanup = executorCleanupScope.onError(
      harness.executors.failing("per"),
      execCallback,
    )
    execCleanup()
    await expect(
      executorCleanupScope.resolve(harness.executors.failing("per")),
    ).rejects.toThrow()
    expect(execCallback).not.toHaveBeenCalled()

    const disposedScope = createScope()
    await disposedScope.dispose()
    expect(() => disposedScope.onError(() => {})).toThrow("Scope is disposed")
    expect(() =>
      disposedScope.onError(harness.executors.failing("x"), () => {}),
    ).toThrow("Scope is disposed")

    const asyncScope = createScope()
    const asyncCallback = vi.fn().mockResolvedValue(undefined)
    asyncScope.onError(asyncCallback)
    await expect(
      asyncScope.resolve(harness.executors.failing("async")),
    ).rejects.toThrow()
    expect(asyncCallback).toHaveBeenCalledTimes(1)
  })

  scenario("scope.run variants", async () => {
    const scope = createScope()
    const userService = provide(() => ({ list: () => ["u1", "u2"] }))
    const postDb = provide(() => ({ get: (page: number) => [`post-${page}`] }))
    const value = provide(() => 42)

    const basic = await scope.run({ userService }, ({ userService }) =>
      userService.list(),
    )
    expect(basic).toEqual(["u1", "u2"])

    const withParams = await scope.run(
      { userService, postDb },
      ({ userService, postDb }, id: string, page: number) => ({
        user: userService.list()[0],
        posts: postDb.get(page),
        id,
      }),
      ["user-1", 3],
    )
    expect(withParams).toEqual({
      user: "u1",
      posts: ["post-3"],
      id: "user-1",
    })

    const inferredSingle = await scope.run(value, (resolved) => resolved * 2)
    expect(inferredSingle).toBe(84)

    const arrDeps = await scope.run([value, provide(() => 1)], ([v, one]) => v + one)
    expect(arrDeps).toBe(43)

    const objDeps = await scope.run(
      { num: value, str: provide(() => "hello") },
      ({ num, str }) => `${str}-${num}`,
    )
    expect(objDeps).toBe("hello-42")

    await expect(
      scope.run({ bad: provide(() => {
        throw new Error("dep fail")
      }) }, ({ bad }) => bad),
    ).rejects.toThrow("dep fail")

    await expect(
      scope.run({ value }, () => {
        throw new Error("callback error")
      }),
    ).rejects.toThrow("callback error")

    let executionCount = 0
    const counted = provide(() => {
      executionCount += 1
      return 5
    })
    await scope.run({ counted }, ({ counted }) => counted)
    await scope.run({ counted }, ({ counted }) => counted)
    expect(executionCount).toBe(1)

    let callbackCount = 0
    await scope.run({ counted }, () => {
      callbackCount += 1
      return 1
    })
    await scope.run({ counted }, () => {
      callbackCount += 1
      return 1
    })
    expect(callbackCount).toBe(2)

    const asyncResult = await scope.run({ value }, async ({ value }) => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return value * 2
    })
    expect(asyncResult).toBe(84)

    const nested = provide(() => 10)
    const derived = derive({ nested }, ({ nested }) => nested * 2)
    const nestedResult = await scope.run({ derived }, ({ derived }) => derived + 5)
    expect(nestedResult).toBe(25)

    const multiType = await scope.run(
      { svc: provide(() => ({ multiply: (a: number, b: number) => a * b })) },
      ({ svc }, a: number, b: string) => svc.multiply(a, parseInt(b, 10)),
      [5, "10"],
    )
    expect(multiType).toBe(50)

    const empty = await scope.run({}, () => "no deps")
    expect(empty).toBe("no deps")

    await scope.dispose()
    const disposed = createScope()
    await disposed.dispose()
    expect(() =>
      disposed.run({ value }, ({ value }) => value),
    ).toThrow("Scope is disposed")

    const closureScope = createScope()
    const other = provide(() => 10)
    const closureResult = await closureScope.run(
      { value },
      async ({ value }) => {
        const otherValue = await closureScope.resolve(other)
        return value + otherValue
      },
    )
    expect(closureResult).toBe(52)
    await closureScope.dispose()
  })

  scenario("helpers, promised utilities, and validation errors", async () => {
    const cases = [
      { input: () => [provide(() => 1), provide(() => 2), provide(() => 3)], expected: [1, 2, 3] },
      { input: () => ({ a: provide(() => 1), b: provide(() => "hello") }), expected: { a: 1, b: "hello" } },
      { input: () => [provide(() => 1), { escape: () => provide(() => 2) }], expected: [1, 2] },
      { input: () => ({ value: { escape: () => provide(() => 42) } }), expected: { value: 42 } },
      { input: () => [provide(() => 10).lazy], expected: [10] },
      { input: () => [provide(() => 20).reactive], expected: [20] },
      { input: () => [provide(() => 30).static], expected: [30] },
    ]
    for (const entry of cases) {
      const scope = createScope()
      const result = await resolves(scope, entry.input() as any)
      expect(result).toEqual(entry.expected)
      await scope.dispose()
    }

    const p1 = Promised.create(Promise.resolve(1))
    const p2 = 2
    const p3 = Promised.create(Promise.resolve(3))
    expect(await Promised.all([p1, p2, p3])).toEqual([1, 2, 3])

    const race = await Promised.race([
      Promised.create(Promise.resolve("fast")),
      Promised.create(
        new Promise((resolve) => setTimeout(() => resolve("slow"), 20)),
      ),
    ])
    expect(race).toBe("fast")

    const promisedTry = Promised.try(() => {
      throw new Error("sync error")
    })
    await expect(promisedTry.toPromise()).rejects.toThrow("sync error")

    const asyncSchema = {
      "~standard": {
        vendor: "test",
        version: 1 as const,
        validate: () => Promise.resolve({ value: "async" as const }),
      },
    }
    expect(() => validate(asyncSchema, "x")).toThrow(
      "validating async is not supported",
    )

    const failingSchema = {
      "~standard": {
        vendor: "test",
        version: 1 as const,
        validate: () => ({ issues: [{ message: "validation failed" }] }),
      },
    }
    expect(() => validate(failingSchema, "x")).toThrow("validation failed")
  })

  scenario("meta system and exports", async () => {
    const validationFn = vi.fn()
    const nameTag = tag<string>(
      {
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value: unknown) {
            validationFn(value)
            if (typeof value !== "string") {
              return { issues: [{ message: "must be a string" }] }
            }
            return { value }
          },
        },
      },
      { label: "name" },
    )
    const executor = provide(() => null, nameTag("test"))
    expect(nameTag("test").value).toBe("test")
    expect(nameTag.readFrom(executor)).toBe("test")
    expect(nameTag.collectFrom(executor)).toEqual(["test"])
    expect(validationFn).toHaveBeenCalled()

    const markerTag = tag(custom<boolean>(), { default: true })
    expect(markerTag().value).toBe(true)
    expect(markerTag.readFrom(provide(() => null, markerTag()))).toBe(true)

    const configTag = tag(custom<string>(), { label: "config" })
    const debugTag = tag(custom<string>(), { label: "debug" })
    const scope = createScope({ tags: [configTag("prod"), debugTag("off")] })
    expect(configTag.extractFrom(scope)).toBe("prod")
    expect(debugTag.extractFrom(scope)).toBe("off")
    const envExecutor = provide((controller) => {
      const env = configTag.extractFrom(controller.scope)
      return `env:${env}`
    })
    expect(await scope.resolve(envExecutor)).toBe("env:prod")

    const exported = tag(custom<string>())
    const requiredExec = tags.required(exported)
    const optionalExec = tags.optional(exported)
    const allExec = tags.all(exported)
    expect(requiredExec).toBeDefined()
    expect(optionalExec).toBeDefined()
    expect(allExec).toBeDefined()
  })

  scenario("reactive flows, presets, and registry options", async () => {
    const name = tag(custom<string>(), { label: "name" })
    const configFactory = vi.fn(() => ({
      dbName: "test",
      port: 3000,
      logLevel: "debug",
    }))
    const config = provide(configFactory, name("config"))
    const logger = derive(config, async (conf) => {
      return (...msgs: unknown[]) => msgs.join(" ")
    })
    const counter = provide(() => 0, name("counter"))
    const incremented = derive(counter.reactive, (count) => count + 1, name("inc"))
    const doubleInc = derive(
      incremented.reactive,
      (count) => count + 1,
      name("double"),
    )
    const scope = createScope()
    const loggerFn = await scope.resolve(logger)
    expect(typeof loggerFn).toBe("function")
    expect(configFactory).toHaveBeenCalledTimes(1)
    expect(await scope.resolve(counter)).toBe(0)
    expect(await scope.resolve(incremented)).toBe(1)
    const doubleAccessor = scope.accessor(doubleInc)
    expect(await doubleAccessor.resolve()).toBe(2)
    await scope.update(counter, (value) => value + 1)
    expect(await scope.resolve(incremented)).toBe(2)
    expect(doubleAccessor.get()).toBe(3)

    const cleanupCallback = vi.fn()
    const derivedArrayCounter = derive(
      [counter.reactive],
      ([value], ctl) => {
        ctl.cleanup(cleanupCallback)
        return value.toString()
      },
    )
    const updateCallback = vi.fn()
    const cleanupUpdate = scope.onUpdate(counter, (accessor) => {
      updateCallback(accessor.get())
    })
    const arrayAccessor = await scope.resolveAccessor(derivedArrayCounter)
    expect(arrayAccessor.get()).toBe("1")
    await scope.update(counter, (value) => value + 1)
    expect(cleanupCallback).toHaveBeenCalledTimes(1)
    expect(updateCallback).toHaveBeenCalledTimes(1)
    await cleanupUpdate()

    const configController = derive(
      config.static,
      (configCtl) => ({
        changeIncrement: (increment: number) =>
          configCtl.update((state) => ({ ...state, increment })),
      }),
      name("configCtl"),
    )
    const timerCounter = provide(() => 0, name("timer"))
    const timer = derive(
      [config.reactive, timerCounter.static],
      ([cfg, counterCtl], ctl) => {
        ctl.cleanup(() => {})
        return cfg.dbName + counterCtl.get()
      },
      name("timer"),
    )
    await scope.resolve(config)
    const controller = await scope.resolve(configController)
    await scope.resolve(timer)
    await controller.changeIncrement(2)

    const releaseScope = createScope()
    const releaseCounter = provide(() => 0)
    const releaseDerived = derive(releaseCounter.reactive, (count) => count + 1)
    const releaseAccessor = await releaseScope.resolveAccessor(releaseCounter)
    const releaseDerivedAccessor = await releaseScope.resolveAccessor(
      releaseDerived,
    )
    expect(releaseAccessor.get()).toBe(0)
    expect(releaseDerivedAccessor.get()).toBe(1)
    await releaseAccessor.update(2)
    expect(releaseDerivedAccessor.get()).toBe(3)

    const presetCounter = provide(() => 0)
    const fakeValue = provide(() => 1)
    const presetDerived = derive(presetCounter, (value) => value + 1)
    let presetScope = createScope()
    expect(await presetScope.resolve(presetDerived)).toBe(1)
    await presetScope.dispose()
    presetScope = createScope(preset(presetCounter, 2))
    expect(await presetScope.resolve(presetDerived)).toBe(3)
    await presetScope.dispose()
    presetScope = createScope(preset(presetCounter, fakeValue))
    expect(await presetScope.resolve(presetDerived)).toBe(2)
    await presetScope.dispose()

    const accessorScope = createScope()
    const accessorCounter = provide(() => 0)
    const accessor = accessorScope.accessor(accessorCounter)
    const p1 = accessor.resolve()
    const p2 = accessor.resolve()
    const another = accessorScope.accessor(accessorCounter)
    expect(p1).toBe(p2)
    expect(another).toBe(accessor)
    expect(another.resolve()).toBe(accessor.resolve())

    const eagerTag = tag(custom<boolean>(), { label: "eager" })
    const eagerExtension: Extension.Extension = {
      name: "eager-load",
      init: (scope) =>
        new Promised(
          (async () => {
            for (const executor of scope.registeredExecutors()) {
              if (eagerTag.readFrom(executor)) {
                await scope.resolve(executor)
              }
            }
          })(),
        ),
    }
    const eagerCounter = provide(() => 0)
    const fn = vi.fn((value: number) => value + 1)
    const eagerDerived = derive(eagerCounter, (value) => fn(value), eagerTag(true))
    createScope({
      initialValues: [preset(eagerCounter, 2)],
      extensions: [eagerExtension],
      registry: [eagerDerived],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fn).toHaveBeenCalledWith(2)

    const valueExecutor = provide(() => 0)
    const reloadingFn = vi.fn()
    const reloading = derive(valueExecutor, (value, ctl) => {
      reloadingFn()
      const timeout = setTimeout(() => ctl.reload(), 10)
      ctl.cleanup(() => clearTimeout(timeout))
      return value + 1
    })
    const reloadScope = createScope()
    await reloadScope.resolve(reloading)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(reloadingFn.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
