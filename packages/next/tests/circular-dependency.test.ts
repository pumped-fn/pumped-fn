import { test, expect, describe } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { meta } from "../src/meta";
import { custom } from "../src/ssch";
import { ErrorCodes } from "../src/error-codes";
import { DependencyResolutionError } from "../src/types";

const name = meta("name", custom<string>());

const expectCircularDependencyError = async (executor: any) => {
  const scope = createScope();
  await expect(scope.resolve(executor)).rejects.toThrow();

  try {
    await scope.resolve(executor);
    expect.fail("Should have thrown circular dependency error");
  } catch (error) {
    expect(error).toBeInstanceOf(DependencyResolutionError);
    expect((error as DependencyResolutionError).code).toBe(
      ErrorCodes.CIRCULAR_DEPENDENCY
    );
    expect((error as Error).message).toContain("Circular dependency detected");
  }
};

describe("circular dependency detection", () => {
  test("detects direct two-way circular dependency between services", async () => {
    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));
    const serviceB = derive(
      serviceA,
      (a) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = serviceB;
    await expectCircularDependencyError(serviceA);
  });

  test("detects transitive circular dependency through multiple services", async () => {
    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));
    const serviceB = derive(
      serviceA,
      (a) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );
    const serviceC = derive(
      serviceB,
      (b) => ({ name: "serviceC", dependency: b }),
      name("serviceC")
    );

    serviceA.dependencies = serviceC;
    await expectCircularDependencyError(serviceA);
  });

  test("detects self-referencing executor dependency", async () => {
    const selfRef = provide(() => ({ name: "selfRef" }), name("selfRef"));

    selfRef.dependencies = selfRef;
    await expectCircularDependencyError(selfRef);
  });

  test("should handle circular dependency with array dependencies", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      [serviceA],
      ([a]) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = [serviceB];

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should handle circular dependency with object dependencies", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      { a: serviceA },
      ({ a }) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = { b: serviceB };

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should handle circular dependency with async factories", async () => {
    const scope = createScope();

    const serviceA = provide(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { name: "serviceA" };
      },
      name("serviceA")
    );

    const serviceB = derive(
      serviceA,
      async (a) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { name: "serviceB", dependency: a };
      },
      name("serviceB")
    );

    serviceA.dependencies = serviceB;

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should handle circular dependency with reactive executors", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      serviceA.reactive,
      (a) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = serviceB.reactive;

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should allow valid complex dependency chains without false positives", async () => {
    const scope = createScope();

    const config = provide(() => ({ dbUrl: "test://db" }), name("config"));

    const dbConnection = derive(
      config,
      (cfg) => ({ connection: cfg.dbUrl }),
      name("dbConnection")
    );

    const userService = derive(
      dbConnection,
      (db) => ({ service: "user", db }),
      name("userService")
    );

    const orderService = derive(
      [dbConnection, userService],
      ([db, user]) => ({ service: "order", db, user }),
      name("orderService")
    );

    const notificationService = derive(
      { user: userService, order: orderService },
      ({ user, order }) => ({
        service: "notification",
        dependencies: { user, order },
      }),
      name("notificationService")
    );

    const result = await scope.resolve(notificationService);
    expect(result).toBeDefined();
    expect(result.service).toBe("notification");
    expect(result.dependencies.user.service).toBe("user");
    expect(result.dependencies.order.service).toBe("order");
  });

  test("should provide detailed error information in circular dependency", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      serviceA,
      (a) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    const serviceC = derive(
      serviceB,
      (b) => ({ name: "serviceC", dependency: b }),
      name("serviceC")
    );

    serviceA.dependencies = serviceC;

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      const depError = error as DependencyResolutionError;

      expect(depError.code).toBe(ErrorCodes.CIRCULAR_DEPENDENCY);
      expect(depError.context.resolutionStage).toBe("dependency-resolution");
      expect(depError.context.dependencyChain).toBeDefined();
      expect(depError.context.dependencyChain.length).toBeGreaterThan(0);
      expect(depError.context.additionalInfo?.circularPath).toBeDefined();
      expect(depError.context.additionalInfo?.detectedAt).toBeDefined();
    }
  });

  test("should handle circular dependency detection with static executors", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      serviceA.static,
      (a) => ({ name: "serviceB", dependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = serviceB.static;

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should handle circular dependency detection with lazy executors", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));

    const serviceB = derive(
      serviceA.lazy,
      (a) => ({ name: "serviceB", lazyDependency: a }),
      name("serviceB")
    );

    serviceA.dependencies = serviceB;

    try {
      await scope.resolve(serviceA);
      expect.fail("Should have thrown circular dependency error");
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyResolutionError);
      expect((error as DependencyResolutionError).code).toBe(
        ErrorCodes.CIRCULAR_DEPENDENCY
      );
    }
  });

  test("should clean up resolution chain after successful resolution", async () => {
    const scope = createScope();

    const service = provide(() => ({ name: "test" }), name("service"));
    await scope.resolve(service);

    const result1 = await scope.resolve(service);
    const result2 = await scope.resolve(service);

    expect(result1).toBe(result2); // Should be cached
  });

  test("should clean up resolution chain after failed resolution", async () => {
    const scope = createScope();

    const failingService = provide(() => {
      throw new Error("Factory error");
    }, name("failingService"));

    try {
      await scope.resolve(failingService);
      expect.fail("Should have thrown factory error");
    } catch (error) {
      expect((error as Error).message).toContain("Factory error");
    }

    try {
      await scope.resolve(failingService);
      expect.fail("Should have thrown factory error again");
    } catch (error) {
      expect((error as Error).message).toContain("Factory error");
    }
  });

  test("should handle multiple independent resolution chains", async () => {
    const scope = createScope();

    const serviceA = provide(() => ({ name: "serviceA" }), name("serviceA"));
    const serviceB = provide(() => ({ name: "serviceB" }), name("serviceB"));

    const derivedA = derive(
      serviceA,
      (a) => ({ derived: a }),
      name("derivedA")
    );
    const derivedB = derive(
      serviceB,
      (b) => ({ derived: b }),
      name("derivedB")
    );

    const [resultA, resultB] = await Promise.all([
      scope.resolve(derivedA),
      scope.resolve(derivedB),
    ]);

    expect(resultA.derived.name).toBe("serviceA");
    expect(resultB.derived.name).toBe("serviceB");
  });
});
