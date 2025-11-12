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
});
