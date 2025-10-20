import { vi, test, expect } from "vitest";
import { provide, derive, preset } from "../src/executor";
import { createScope } from "../src/scope";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { Promised } from "../src/promises";
import { type Extension } from "../src";

const name = tag(custom<string>(), { label: "name" });

test("demonstrates core dependency injection and reactive patterns", async () => {
  const configFactory = vi.fn(() => ({
    dbName: "test",
    port: 3000,
    logLevel: "debug",
  }));

  const config = provide(configFactory, name("config"));

  const logger = derive(
    config,
    async (config) => {
      return (...msgs: unknown[]) => console.log(config.logLevel, ...msgs);
    },
    name("logger")
  );

  const counter = provide(() => 0, name("counter"));
  const incrementedCounter = derive(
    counter.reactive,
    (count) => {
      return count + 1;
    },
    name("incrementedCounter")
  );

  const doubleIncrementedCounter = derive(
    incrementedCounter.reactive,
    (count) => {
      return count + 1;
    },
    name("doubleIncrementedCounter")
  );

  const scope = createScope();

  const loggerFunction = await scope.resolve(logger);
  loggerFunction("Hello world");

  expect(configFactory).toBeCalledTimes(1);

  const counterValue = await scope.resolve(counter);
  const incrementedValue = await scope.resolve(incrementedCounter);
  const doubleIncrementedAccessor = scope.accessor(doubleIncrementedCounter);

  expect(counterValue).toBe(0);
  expect(incrementedValue).toBe(1);
  expect(await doubleIncrementedAccessor.resolve()).toBe(2);

  await scope.update(counter, (current) => current + 1);

  const updatedIncrementedValue = await scope.resolve(incrementedCounter);

  expect(updatedIncrementedValue).toBe(2);
  expect(doubleIncrementedAccessor.get()).toBe(3);
});

test("propagates reactive changes through dependency graph", async () => {
  const cleanupCallback = vi.fn();
  const counter = provide(() => 0, name("counter"));
  const derivedCounter = derive(counter.reactive, (count) => count.toString());
  const derivedArrayCounter = derive([counter.reactive], (count, ctl) => {
    ctl.cleanup(cleanupCallback);
    return count.toString();
  });

  const derivedObjectCounter = derive(
    { counter: counter.reactive },
    ({ counter }) => counter.toString()
  );

  const updateCallback = vi.fn();

  const scope = createScope();
  const cleanup = scope.onUpdate(counter, (accessor) => {
    updateCallback(accessor.get());
  });

  const derivedCounterAccessor = await scope.resolveAccessor(derivedCounter);
  const derivedArrayAccessor = await scope.resolveAccessor(
    derivedArrayCounter
  );
  const derivedObjectAccessor = await scope.resolveAccessor(
    derivedObjectCounter
  );

  expect(derivedCounterAccessor.get()).toBe("0");
  expect(derivedArrayAccessor.get()).toEqual("0");
  expect(derivedObjectAccessor.get()).toEqual("0");
  expect(cleanupCallback).toBeCalledTimes(0);

  await scope.update(counter, (current) => current + 1);

  expect(cleanupCallback).toBeCalledTimes(1);
  expect(updateCallback).toBeCalledTimes(1);
  expect(updateCallback).toBeCalledWith(1);

  expect(derivedCounterAccessor.get()).toBe("1");
  expect(derivedArrayAccessor.get()).toEqual("1");
  expect(derivedObjectAccessor.get()).toEqual("1");

  await scope.update(counter, (current) => current + 1);

  expect(updateCallback).toBeCalledTimes(2);
  expect(updateCallback).toBeCalledWith(2);
  expect(derivedCounterAccessor.get()).toBe("2");
  expect(derivedArrayAccessor.get()).toEqual("2");
  expect(derivedObjectAccessor.get()).toEqual("2");

  await cleanup();

  await scope.update(counter, (current) => current + 1);

  expect(updateCallback).toBeCalledTimes(2);
});

test("complicated cleanup", async () => {
  const name = tag(custom<string>(), { label: "name" });
  const fn = vi.fn();

  const config = provide(
    () => ({
      increment: 1,
      interval: 1000,
    }),
    name("config")
  );

  const configController = derive(
    config.static,
    (configCtl) => {
      return {
        changeIncrement: (increment: number) =>
          configCtl.update((config) => ({ ...config, increment })),
        changeInterval: (interval: number) =>
          configCtl.update((config) => ({ ...config, interval })),
      };
    },
    name("configCtl")
  );

  const counter = provide(() => 0, name("timer"));

  const timer = derive(
    [config.reactive, counter.static],
    ([config, counterCtl], ctl) => {
      fn("config", config);

      ctl.cleanup(fn);
    },
    name("timer")
  );

  const scope = createScope();

  await scope.resolve(config);
  const ctl = await scope.resolve(configController);
  await scope.resolve(timer);

  await ctl.changeIncrement(2);
  expect(fn).toBeCalledTimes(3);

  expect(fn.mock.calls).toEqual([
    ["config", { increment: 1, interval: 1000 }],
    [],
    ["config", { increment: 2, interval: 1000 }],
  ]);

  await ctl.changeIncrement(3);
  expect(fn).toBeCalledTimes(5);
  expect(fn.mock.calls).toEqual([
    ["config", { increment: 1, interval: 1000 }],
    [],
    ["config", { increment: 2, interval: 1000 }],
    [],
    ["config", { increment: 3, interval: 1000 }],
  ]);
});

test("can use release to control counter", async () => {
  const counter = provide(() => 0, name("counter"));
  const derivedCounter = derive(
    counter.reactive,
    (count) => count + 1,
    name("derivedCounter")
  );

  const scope = createScope();

  const counterAccessor = await scope.resolveAccessor(counter);
  const derivedCounterAccessor = await scope.resolveAccessor(derivedCounter);

  expect(counterAccessor.get()).toBe(0);
  expect(derivedCounterAccessor.get()).toBe(1);

  await counterAccessor.update(2);
  expect(counterAccessor.get()).toBe(2);
  expect(derivedCounterAccessor.get()).toBe(3);
});

test("preset works with value and executor", async () => {
  const counter = provide(() => 0, name("counter"));
  const fakeValue = provide(() => 1);
  const derivedCounter = derive(counter, (counter) => counter + 1);

  let scope = createScope();
  expect(await scope.resolve(derivedCounter)).toBe(1);
  await scope.dispose();

  scope = createScope(preset(counter, 2));
  expect(await scope.resolve(derivedCounter)).toBe(3);
  await scope.dispose();

  scope = createScope(preset(counter, fakeValue));
  expect(await scope.resolve(derivedCounter)).toBe(2);
  await scope.dispose();
});

test("same promise with different resolves", async () => {
  const counter = provide(() => 0);
  const scope = createScope();
  const accessor = scope.accessor(counter);

  const p1 = accessor.resolve();
  const p2 = accessor.resolve();

  const anotherAccessor = scope.accessor(counter);

  expect(p1).toBe(p2);
  expect(anotherAccessor).toBe(accessor);
  expect(anotherAccessor.resolve()).toBe(accessor.resolve());
});


test("test scope option", async () => {
  const eagerTag = tag(custom<boolean>(), { label: "eagerLoad" });
  const eagerLoadExtension: Extension.Extension = {
    name: "eager-load",
    init: (scope) => {
      return new Promised((async () => {
        for (const executor of scope.registeredExecutors()) {
          if (eagerTag.find(executor)) {
            await scope.resolve(executor);
          }
        }
      })());
    },
  };

  const counter = provide(() => 0);
  const fn = vi.fn((count: number) => count + 1);
  const plus = derive(counter, (count) => fn(count), eagerTag(true));

  createScope({
    initialValues: [preset(counter, 2)],
    extensions: [eagerLoadExtension],
    registry: [plus],
  });

  setTimeout(() => {
    expect(fn).toHaveBeenCalledWith(2);
  }, 0);
});

test("provider can control itself", async () => {
  const value = provide(() => 0);
  const fn = vi.fn();
  const derivedValue = derive(value, (value, ctl) => {
    fn();
    const timeout = setTimeout(() => {
      ctl.reload();
    }, 100);

    ctl.cleanup(() => {
      clearTimeout(timeout);
    });

    return value + 1;
  });

  const scope = createScope();

  let firstValue = await scope.resolve(derivedValue);
  expect(firstValue).toBe(1);
  expect(fn).toBeCalledTimes(1);

  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(fn).toBeCalledTimes(2);
});

