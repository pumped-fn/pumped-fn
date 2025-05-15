import { vi, test, expect } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope, ScopeInner } from "../src/scope";
import { meta } from "../src/meta";
import { custom } from "../src/ssch";

const name = meta("name", custom<string>());

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

const db = derive(
  { config, logger },
  ({ config, logger }) => {
    return {
      query: (sql: string) => {
        logger(sql);
        return `Querying ${sql} on ${config.dbName}`;
      },
    };
  },
  name("db")
);

const helloRoute = derive({ logger, db }, ({ logger, db }) => {
  return {
    handler: (req: unknown) => {
      logger("Handling request", req);
      return db.query("SELECT * FROM users");
    },
  };
});

const versionRoute = derive({ logger }, ({ logger }) => {
  return {
    handler: (req: unknown) => {
      logger("Handling version request", req);
      return "Version 1.0.0";
    },
  };
});

const server = derive(
  [config, helloRoute, versionRoute],
  ([config, ...routes]) => {
    return {
      start: () => {
        console.log(
          "registered routes",
          routes.map((route) => route.handler)
        );

        console.log(`Server started on port ${config.port}`);
      },
    };
  }
);

const cmd = derive(
  { config, hello: helloRoute.lazy, version: versionRoute.lazy },
  ({ config, hello, version }) => {
    // parse args
    // based on args, call the appropriate route
  }
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

test("syntax", async () => {
  const scope = createScope();

  const loggerFn = await scope.resolve(logger);
  loggerFn("Hello world");

  const serverCmd = await scope.resolve(cmd);

  expect(configFn).toBeCalledTimes(1);
});

test("reactive", async () => {
  const scope = createScope();

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

test("reset", async () => {
  const scope = createScope();

  const counterFn = vi.fn(() => 1);
  const uFn = vi.fn();
  const rFn = vi.fn();

  const counter = provide(counterFn, name("counter"));
  const resource = derive(
    counter.reactive,
    (counter, controller) => {
      controller.cleanup(uFn);
      rFn();
      return counter + 1;
    },
    name("resource")
  );

  const nonRelatedResource = derive(counter, (counter) => {
    rFn();
    return counter + 2;
  });

  await scope.resolve(nonRelatedResource);
  const resolvedResource = await scope.resolveAccessor(resource);
  expect(resolvedResource.get()).toBe(2);
  expect(rFn).toBeCalledTimes(2);

  await scope.update(counter, 2);
  expect(rFn).toBeCalledTimes(3);

  await scope.update(counter, 3);
  expect(rFn).toBeCalledTimes(4);

  await scope.release(counter);
  expect(counterFn).toBeCalledTimes(1);
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
  const scopeInner = scope as unknown as ScopeInner;

  await scope.resolve(config);
  const ctl = await scope.resolve(configController);
  await scope.resolve(timer);

  const affectedSet = scopeInner["~findAffectedTargets"](config);

  expect(affectedSet.size).toBe(1); // configController
  expect(affectedSet.has(timer)).toBeTruthy();

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
