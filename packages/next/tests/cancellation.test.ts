import { describe, it, expect } from "vitest";
import { AbortError } from "../src/errors";
import { type Core } from "../src/types";
import { createCancellationExtension } from "../src/cancellation";
import { createScope } from "../src/scope";
import { provide, derive } from "../src";
import { flow } from "../src/flow";
import { custom } from "../src/ssch";

describe("AbortError", () => {
  it("creates error with reason", () => {
    const reason = "User requested";
    const error = new AbortError(reason);

    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("Operation aborted");
    expect(error.cause).toBe(reason);
  });

  it("creates error without reason", () => {
    const error = new AbortError();

    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("Operation aborted");
    expect(error.cause).toBeUndefined();
  });
});

describe("Controller signal type", () => {
  it("accepts controller with signal", () => {
    const controller: Core.Controller = {
      cleanup: () => {},
      release: () => null as any,
      reload: () => null as any,
      scope: null as any,
      signal: new AbortController().signal,
    };

    expect(controller.signal).toBeDefined();
  });

  it("accepts controller without signal", () => {
    const controller: Core.Controller = {
      cleanup: () => {},
      release: () => null as any,
      reload: () => null as any,
      scope: null as any,
    };

    expect(controller.signal).toBeUndefined();
  });
});

describe("createCancellationExtension", () => {
  it("creates extension without parent signal", () => {
    const ext = createCancellationExtension();

    expect(ext.name).toBe("cancellation");
    expect(ext.controller).toBeInstanceOf(AbortController);
    expect(ext.controller.signal.aborted).toBe(false);
  });

  it("creates extension with parent signal", () => {
    const parent = new AbortController();
    const ext = createCancellationExtension(parent.signal);

    expect(ext.controller).toBeInstanceOf(AbortController);
    expect(ext.controller.signal.aborted).toBe(false);
  });

  it("aborts when parent aborts", () => {
    const parent = new AbortController();
    const ext = createCancellationExtension(parent.signal);

    parent.abort("test reason");

    expect(ext.controller.signal.aborted).toBe(true);
    expect(ext.controller.signal.reason).toBe("test reason");
  });
});

describe("Extension wrap", () => {
  it("rejects new operations after abort", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    const executor = provide(() => "value");

    ext.controller.abort("shutdown");

    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      AbortError
    );
    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      "Operation aborted"
    );
  });

  it("allows in-flight operations to complete without deadline", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let resolveOp: (value: string) => void;
    const operationPromise = new Promise<string>((resolve) => {
      resolveOp = resolve;
    });

    const executor = provide(() => operationPromise);

    const resolution = scope.resolve(executor);

    ext.controller.abort("shutdown");

    resolveOp!("completed");

    const result = await resolution.toPromise();
    expect(result).toBe("completed");
  });

  it("does not cancel in-flight operations that complete before abort", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    const fastOperation = provide(() => {
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve("completed"), 10);
      });
    });

    const resolution = scope.resolve(fastOperation);

    setTimeout(() => ext.controller.abort("shutdown"), 50);

    const result = await resolution.toPromise();
    expect(result).toBe("completed");
  });
});

describe("Extension dispose", () => {
  it("aborts controller when scope disposes", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    await scope.dispose().toPromise();

    expect(ext.controller.signal.aborted).toBe(true);
    expect(ext.controller.signal.reason).toBe("Scope disposed");
  });

  it("does not abort twice", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    ext.controller.abort("manual");
    await scope.dispose().toPromise();

    expect(ext.controller.signal.reason).toBe("manual");
  });
});

describe("Factory signal integration", () => {
  it("provides signal to factory", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let receivedSignal: AbortSignal | undefined;
    const executor = provide((controller) => {
      receivedSignal = controller.signal;
      return "value";
    });

    await scope.resolve(executor).toPromise();

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBe(ext.controller.signal);
  });

  it("factory can check abort state", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let wasAborted = false;
    const executor = provide((controller) => {
      wasAborted = controller.signal?.aborted || false;
      return "value";
    });

    ext.controller.abort();

    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      AbortError
    );
    expect(wasAborted).toBe(false);
  });

  it("factory can listen to abort events for cleanup", async () => {
    const ext = createCancellationExtension({ deadline: 50 });
    const scope = createScope({ extensions: [ext] });

    const executor = provide((controller) => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve("value"), 200);

        controller.signal?.addEventListener("abort", () => {
          clearTimeout(timeout);
        });
      });
    });

    const resolution = scope.resolve(executor);

    setTimeout(() => ext.controller.abort(), 10);

    await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
  });
});

describe("Long-running cancellation", () => {
  describe("Flow cancellation", () => {
    it("cancels flow execution when aborted with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const longRunningFlow = flow(
        { input: custom<void>(), output: custom<string>() },
        async (ctx) => {
          return new Promise<string>((resolve) => {
            setTimeout(() => resolve("completed"), 200);
          });
        }
      );

      const execution = scope.exec(longRunningFlow, undefined);

      setTimeout(() => ext.controller.abort("timeout"), 10);

      await expect(execution.toPromise()).rejects.toThrow("Operation aborted");
    });

    it("cancels flow with ctx.run when aborted with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const flowWithRun = flow(
        { input: custom<void>(), output: custom<string>() },
        async (ctx) => {
          await ctx.run("step1", async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return "step1 done";
          });

          await ctx.run("step2", async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            return "step2 done";
          });

          return "all done";
        }
      );

      const execution = scope.exec(flowWithRun, undefined);

      setTimeout(() => ext.controller.abort("cancel"), 10);

      await expect(execution.toPromise()).rejects.toThrow("Operation aborted");
    });
  });

  describe("Executor cancellation", () => {
    it("cancels long-running executor with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const longRunningWork = provide((controller) => {
        return new Promise((resolve) => {
          const intervalId = setInterval(() => {
            if (controller.signal?.aborted) {
              clearInterval(intervalId);
            }
          }, 10);

          controller.signal?.addEventListener("abort", () => {
            clearInterval(intervalId);
          });

          setTimeout(() => {
            clearInterval(intervalId);
            resolve("completed");
          }, 200);
        });
      });

      const resolution = scope.resolve(longRunningWork);

      setTimeout(() => ext.controller.abort("timeout"), 10);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
    });

    it("executor with polling loop respects abort signal", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let iterations = 0;
      const maxIterations = 100;

      const pollingExecutor = provide((controller) => {
        return new Promise((resolve, reject) => {
          const poll = () => {
            if (controller.signal?.aborted) {
              reject(new AbortError(controller.signal.reason));
              return;
            }

            iterations++;

            if (iterations >= maxIterations) {
              resolve(iterations);
              return;
            }

            setTimeout(poll, 10);
          };

          poll();
        });
      });

      const resolution = scope.resolve(pollingExecutor);

      setTimeout(() => ext.controller.abort("stop polling"), 25);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
      expect(iterations).toBeLessThan(maxIterations);
      expect(iterations).toBeGreaterThan(0);
    });

    it("dependent executor cancels with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const dataFetcher = provide((controller) => {
        return new Promise<{ data: string }>((resolve) => {
          const timeout = setTimeout(() => {
            resolve({ data: "fetched" });
          }, 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
          });
        });
      });

      const dataProcessor = derive(dataFetcher, (data) => {
        return `processed: ${data.data}`;
      });

      const resolution = scope.resolve(dataProcessor);

      setTimeout(() => ext.controller.abort("cancel"), 10);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
    });

    it("multiple concurrent executors cancel with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const createOperation = (id: number) =>
        provide((controller) => {
          return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(`op-${id}`), 200);

            controller.signal?.addEventListener("abort", () => {
              clearTimeout(timeout);
            });
          });
        });

      const op1 = scope.resolve(createOperation(1));
      const op2 = scope.resolve(createOperation(2));
      const op3 = scope.resolve(createOperation(3));

      setTimeout(() => ext.controller.abort("cancel all"), 10);

      await expect(op1.toPromise()).rejects.toThrow("Operation aborted");
      await expect(op2.toPromise()).rejects.toThrow("Operation aborted");
      await expect(op3.toPromise()).rejects.toThrow("Operation aborted");
    });
  });

  describe("Hierarchical cancellation", () => {
    it("parent abort cancels child scope with deadline", async () => {
      const parentExt = createCancellationExtension({ deadline: 50 });
      const parentScope = createScope({ extensions: [parentExt] });

      const childExt = createCancellationExtension({
        parentSignal: parentExt.controller.signal,
        deadline: 50,
      });
      const childScope = createScope({ extensions: [childExt] });

      const parentWork = provide((controller) => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve("parent done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
          });
        });
      });

      const childWork = provide((controller) => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve("child done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
          });
        });
      });

      const parentResolution = parentScope.resolve(parentWork);
      const childResolution = childScope.resolve(childWork);

      setTimeout(() => parentExt.controller.abort("shutdown"), 10);

      await expect(parentResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );
      await expect(childResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );
    });

    it("child abort with deadline does not affect parent scope", async () => {
      const parentExt = createCancellationExtension();
      const parentScope = createScope({ extensions: [parentExt] });

      const childExt = createCancellationExtension({
        parentSignal: parentExt.controller.signal,
        deadline: 50,
      });
      const childScope = createScope({ extensions: [childExt] });

      const parentWork = provide(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve("parent done"), 100);
        });
      });

      const childWork = provide((controller) => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve("child done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
          });
        });
      });

      const parentResolution = parentScope.resolve(parentWork);
      const childResolution = childScope.resolve(childWork);

      setTimeout(() => childExt.controller.abort("child only"), 10);

      await expect(childResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );

      const parentResult = await parentResolution.toPromise();
      expect(parentResult).toBe("parent done");
    });
  });

  describe("New operations after abort", () => {
    it("rejects new executor resolution after abort", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      const executor = provide(() => "value");

      ext.controller.abort("shutdown");

      await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
        "Operation aborted"
      );
    });
  });

    describe("Abort during resolution", () => {
    it("handles abort during factory execution with deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const executor = provide((controller) => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve("done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
          });
        });
      });

      const resolution = scope.resolve(executor);

      setTimeout(() => ext.controller.abort("immediate"), 10);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
    });

    it("cleanup runs when executor released", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let cleanupRan = false;

      const executor = provide((controller) => {
        controller.cleanup(() => {
          cleanupRan = true;
        });

        return "value";
      });

      await scope.resolve(executor).toPromise();

      await scope.release(executor).toPromise();

      expect(cleanupRan).toBe(true);
    });
  });

  describe("Deadline", () => {
    it("allows in-flight operations to complete before deadline", async () => {
      const ext = createCancellationExtension({ deadline: 100 });
      const scope = createScope({ extensions: [ext] });

      const operation = provide(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("completed"), 50);
        });
      });

      const resolution = scope.resolve(operation);

      setTimeout(() => ext.controller.abort("shutdown"), 10);

      const result = await resolution.toPromise();
      expect(result).toBe("completed");
    });

    it("rejects in-flight operations exceeding deadline", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const slowOperation = provide(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("completed"), 200);
        });
      });

      const resolution = scope.resolve(slowOperation);

      setTimeout(() => ext.controller.abort("shutdown"), 10);

      try {
        await resolution.toPromise();
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AbortError);
        expect((error as AbortError).message).toBe("Operation aborted");
        expect((error as AbortError).cause).toBe("Deadline exceeded");
      }
    });

    it("new operations after deadline exceeded are rejected", async () => {
      const ext = createCancellationExtension({ deadline: 50 });
      const scope = createScope({ extensions: [ext] });

      const slowOperation = provide(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => resolve("completed"), 200);
        });
      });

      const fastOperation = provide(() => "fast");

      const slowResolution = scope.resolve(slowOperation);

      setTimeout(() => ext.controller.abort("shutdown"), 10);

      await expect(slowResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );

      await new Promise((resolve) => setTimeout(resolve, 60));

      try {
        await scope.resolve(fastOperation).toPromise();
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AbortError);
        expect((error as AbortError).cause).toBe("Deadline exceeded");
      }
    });
  });
});
