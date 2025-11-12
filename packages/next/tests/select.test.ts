import { describe, test, expect } from "vitest";
import { provide } from "../src/executor";
import { createScope } from "../src/scope";

describe("select - basic functionality", () => {
  test("selects property from executor", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    const result = await scope.resolve(port);

    expect(result).toBe(3000);
  });

  test("returns same executor instance for same key", () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));

    const port1 = config.select("port");
    const port2 = config.select("port");

    expect(port1).toBe(port2);
  });

  test("does not propagate when selected value unchanged", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);

    let updateCount = 0;
    scope.onUpdate(port, () => updateCount++);

    await scope.update(config, { port: 3000, host: "127.0.0.1" });

    expect(updateCount).toBe(0, "port should not update when value unchanged");
  });

  test("propagates when selected value changes", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);

    let updateCount = 0;
    scope.onUpdate(port, () => updateCount++);

    await scope.update(config, { port: 8080, host: "localhost" });

    expect(updateCount).toBe(1, "port should update when value changes");
    expect(scope.accessor(port).get()).toBe(8080);
  });

  test("supports custom equals function", async () => {
    const config = provide(() => ({ user: { id: 1, name: "Alice" } }));
    const user = config.select("user", {
      equals: (a, b) => a.id === b.id,
    });

    const scope = createScope();
    await scope.resolve(user);

    let updateCount = 0;
    scope.onUpdate(user, () => updateCount++);

    await scope.update(config, { user: { id: 1, name: "Bob" } });

    expect(updateCount).toBe(0, "user should not update when custom equals returns true");
  });

  test("cleans up updater executor on release", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);

    const entriesBeforeRelease = scope.entries().length;
    expect(entriesBeforeRelease).toBeGreaterThan(1, "should have multiple executors (parent + selected + updater)");

    await scope.release(port);

    const entriesAfterRelease = scope.entries().length;
    expect(entriesAfterRelease).toBeLessThan(entriesBeforeRelease, "should release updater executor");
  });

  test("maintains scope isolation for multi-scope usage", async () => {
    const config = provide(() => ({ count: 0 }));
    const count = config.select("count");

    const scope1 = createScope();
    const scope2 = createScope();

    await scope1.resolve(count);
    await scope2.resolve(count);

    expect(scope1.accessor(count).get()).toBe(0);
    expect(scope2.accessor(count).get()).toBe(0);

    await scope1.update(config, { count: 10 });

    expect(scope1.accessor(count).get()).toBe(10, "scope1 should have updated value");
    expect(scope2.accessor(count).get()).toBe(0, "scope2 should remain unchanged");

    await scope2.update(config, { count: 20 });

    expect(scope1.accessor(count).get()).toBe(10, "scope1 should be unaffected");
    expect(scope2.accessor(count).get()).toBe(20, "scope2 should have its own value");
  });
});
