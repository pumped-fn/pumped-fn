import { vi, test, expect } from "vitest";
import { provide, derive, preset } from "../src/executor";
import { createScope } from "../src/scope";
import { meta } from "../src/meta";
import { custom } from "../src/ssch";
import { type Extension } from "../src";

const name = meta("name", custom<string>());

test("syntax", async () => {
  const configFn = vi.fn(() => ({
    dbName: "test",
    port: 3000,
    logLevel: "debug",
  }));

  const config = provide(configFn, name("config"));

  const logger = derive(
    config,
    async (config) => {
      return (...msgs: unknown[]) => console.log(config.logLevel, ...msgs);
    },
    name("logger")
  );

  const counter = provide(() => 0, name("counter"));
  const reactived = derive(
    counter.reactive,
    (count) => {
      return count + 1;
    },
    name("reactived")
  );

  const reactiveOfReactive = derive(
    reactived.reactive,
    (count) => {
      return count + 1;
    },
    name("reactiveOfReactive")
  );

  const scope = createScope();

  const loggerFn = await scope.resolve(logger);
  loggerFn("Hello world");

  expect(configFn).toBeCalledTimes(1);

  const currentCounterValue = await scope.resolve(counter);
  const derivedCounterValue = await scope.resolve(reactived);
  const derivedOfDerivedCounterValue = scope.accessor(reactiveOfReactive);

  expect(currentCounterValue).toBe(0);
  expect(derivedCounterValue).toBe(1);
  expect(await derivedOfDerivedCounterValue.resolve()).toBe(2);

  await scope.update(counter, (current) => current + 1);
  const updatedCounterValue = await scope.resolve(reactived);
  expect(updatedCounterValue).toBe(2);
  expect(derivedOfDerivedCounterValue.get()).toBe(3);
});

test("reactive changes", async () => {
  const c = vi.fn();
  const counter = provide(() => 0, name("counter"));
  const derivedCounter = derive(counter.reactive, (count) => count.toString());
  const derviedArrayCounter = derive([counter.reactive], (count, ctl) => {
    ctl.cleanup(c);
    return count.toString();
  });

  const derivedObjectCounter = derive(
    { counter: counter.reactive },
    ({ counter }) => counter.toString()
  );

  const fn = vi.fn();

  const scope = createScope();
  const cleanup = scope.onUpdate(counter, (accessor) => {
    fn(accessor.get());
  });

  const resolvedDerivedCounter = await scope.resolveAccessor(derivedCounter);
  const resolvedDerivedArrayCounter = await scope.resolveAccessor(
    derviedArrayCounter
  );
  const resolvedDerivedObjectCounter = await scope.resolveAccessor(
    derivedObjectCounter
  );

  expect(resolvedDerivedCounter.get()).toBe("0");
  expect(resolvedDerivedArrayCounter.get()).toEqual("0");
  expect(resolvedDerivedObjectCounter.get()).toEqual("0");
  expect(c).toBeCalledTimes(0);

  await scope.update(counter, (current) => current + 1);
  expect(c).toBeCalledTimes(1);
  expect(fn).toBeCalledTimes(1);
  expect(fn).toBeCalledWith(1);

  expect(resolvedDerivedCounter.get()).toBe("1");
  expect(resolvedDerivedArrayCounter.get()).toEqual("1");
  expect(resolvedDerivedObjectCounter.get()).toEqual("1");

  await scope.update(counter, (current) => current + 1);
  expect(fn).toBeCalledTimes(2);
  expect(fn).toBeCalledWith(2);
  expect(resolvedDerivedCounter.get()).toBe("2");
  expect(resolvedDerivedArrayCounter.get()).toEqual("2");
  expect(resolvedDerivedObjectCounter.get()).toEqual("2");

  await cleanup();
  await scope.update(counter, (current) => current + 1);
  expect(fn).toBeCalledTimes(2);
});

test("complicated cleanup", async () => {
  const name = meta("name", custom<string>());
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

test("can use preset to advance value", async () => {
  const counter = provide(() => 0, name("counter"));
  const derivedCounter = derive(counter, (counter) => counter + 1);

  const oScope = createScope();
  let value = await oScope.resolve(derivedCounter);
  expect(value).toBe(1);

  const mScope = createScope(preset(counter, 2));
  value = await mScope.resolve(derivedCounter);
  expect(value).toBe(3);
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

test("update without resolving", async () => {
  const counter = provide(() => 0);
  const scope = createScope();

  await scope.set(counter, 2);
});

test("test scope option", async () => {
  const eagerMeta = meta("eagerLoad", custom<boolean>());
  const eagerLoadExtension: Extension.Extension = {
    name: "eager-load",
    init: async (scope) => {
      for (const executor of scope.registeredExecutors()) {
        if (eagerMeta.find(executor)) {
          await scope.resolve(executor);
        }
      }
    },
  };

  const counter = provide(() => 0);
  const fn = vi.fn((count: number) => count + 1);
  const plus = derive(counter, (count) => fn(count), eagerMeta(true));

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

test("preset should work with either value and other executor", async () => {
  const value = provide(() => 0);

  const fakeValue = provide(() => 1);
  const derivedValue = derive(value, (value) => value * 2);

  let scope = createScope(preset(value, fakeValue));
  let resolvedValue = await scope.resolve(derivedValue);
  expect(resolvedValue).toBe(2);
  await scope.dispose();

  scope = createScope(preset(value, 2));
  resolvedValue = await scope.resolve(derivedValue);
  expect(resolvedValue).toBe(4);
});
