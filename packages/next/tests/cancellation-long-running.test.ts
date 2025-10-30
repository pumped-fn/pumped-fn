import { describe, it, expect } from "vitest";
import { createScope } from "../src/scope";
import { provide, derive } from "../src";
import { createCancellationExtension } from "../src/cancellation";
import { AbortError } from "../src/errors";

describe("Long-running cancellation", () => {
  describe("Executor cancellation", () => {
    it("cancels long-running executor and stops work", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let workStopped = false;
      let cleanupCalled = false;

      const longRunningWork = provide((controller) => {
        const intervalId = setInterval(() => {
          if (controller.signal?.aborted) {
            clearInterval(intervalId);
            workStopped = true;
          }
        }, 10);

        controller.signal?.addEventListener("abort", () => {
          clearInterval(intervalId);
          workStopped = true;
        });

        controller.cleanup(() => {
          cleanupCalled = true;
          clearInterval(intervalId);
        });

        return new Promise((resolve) => {
          setTimeout(() => {
            clearInterval(intervalId);
            resolve("completed");
          }, 200);
        });
      });

      const resolution = scope.resolve(longRunningWork);

      setTimeout(() => ext.controller.abort("timeout"), 50);

      await resolution.toPromise();

      expect(workStopped).toBe(true);
      expect(cleanupCalled).toBe(false);
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

    it("dependent executor cancels when dependency is aborted", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let dataFetchStarted = false;
      let dataFetchCompleted = false;
      let processStarted = false;

      const dataFetcher = provide((controller) => {
        dataFetchStarted = true;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            dataFetchCompleted = true;
            resolve({ data: "fetched" });
          }, 100);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new AbortError());
          });
        });
      });

      const dataProcessor = derive(dataFetcher, (data, controller) => {
        processStarted = true;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(`processed: ${data.data}`);
          }, 100);
        });
      });

      const resolution = scope.resolve(dataProcessor);

      setTimeout(() => ext.controller.abort("cancel"), 50);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
      expect(dataFetchStarted).toBe(true);
      expect(dataFetchCompleted).toBe(false);
      expect(processStarted).toBe(false);
    });

    it("multiple concurrent executors cancel together", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      const createOperation = (id: number) =>
        provide((controller) => {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve(`op-${id}`), 150);

            controller.signal?.addEventListener("abort", () => {
              clearTimeout(timeout);
              reject(new AbortError());
            });
          });
        });

      const op1 = scope.resolve(createOperation(1));
      const op2 = scope.resolve(createOperation(2));
      const op3 = scope.resolve(createOperation(3));

      setTimeout(() => ext.controller.abort("cancel all"), 50);

      await expect(op1.toPromise()).rejects.toThrow("Operation aborted");
      await expect(op2.toPromise()).rejects.toThrow("Operation aborted");
      await expect(op3.toPromise()).rejects.toThrow("Operation aborted");
    });
  });

  describe("Hierarchical cancellation", () => {
    it("parent abort cancels child scope with long-running work", async () => {
      const parentExt = createCancellationExtension();
      const parentScope = createScope({ extensions: [parentExt] });

      const childExt = createCancellationExtension(parentExt.controller.signal);
      const childScope = createScope({ extensions: [childExt] });

      let parentWorkStopped = false;
      let childWorkStopped = false;

      const parentWork = provide((controller) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve("parent done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            parentWorkStopped = true;
            reject(new AbortError());
          });
        });
      });

      const childWork = provide((controller) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve("child done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            childWorkStopped = true;
            reject(new AbortError());
          });
        });
      });

      const parentResolution = parentScope.resolve(parentWork);
      const childResolution = childScope.resolve(childWork);

      setTimeout(() => parentExt.controller.abort("shutdown"), 50);

      await expect(parentResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );
      await expect(childResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );
      expect(parentWorkStopped).toBe(true);
      expect(childWorkStopped).toBe(true);
    });

    it("child abort does not affect parent scope", async () => {
      const parentExt = createCancellationExtension();
      const parentScope = createScope({ extensions: [parentExt] });

      const childExt = createCancellationExtension(parentExt.controller.signal);
      const childScope = createScope({ extensions: [childExt] });

      let parentCompleted = false;

      const parentWork = provide((controller) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            parentCompleted = true;
            resolve("parent done");
          }, 100);
        });
      });

      const childWork = provide((controller) => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => resolve("child done"), 200);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new AbortError());
          });
        });
      });

      const parentResolution = parentScope.resolve(parentWork);
      const childResolution = childScope.resolve(childWork);

      setTimeout(() => childExt.controller.abort("child only"), 50);

      await expect(childResolution.toPromise()).rejects.toThrow(
        "Operation aborted"
      );

      const parentResult = await parentResolution.toPromise();
      expect(parentResult).toBe("parent done");
      expect(parentCompleted).toBe(true);
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

    it("allows concurrent in-flight operations to complete after abort", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let op1Completed = false;
      let op2Completed = false;

      const operation1 = provide((controller) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!controller.signal?.aborted) {
              op1Completed = true;
            }
            resolve("op1");
          }, 100);
        });
      });

      const operation2 = provide((controller) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            if (!controller.signal?.aborted) {
              op2Completed = true;
            }
            resolve("op2");
          }, 100);
        });
      });

      const res1 = scope.resolve(operation1);
      const res2 = scope.resolve(operation2);

      setTimeout(() => ext.controller.abort("shutdown"), 50);

      await res1.toPromise();
      await res2.toPromise();

      expect(op1Completed).toBe(false);
      expect(op2Completed).toBe(false);
    });
  });

  describe("Abort during resolution", () => {
    it("handles abort during factory execution", async () => {
      const ext = createCancellationExtension();
      const scope = createScope({ extensions: [ext] });

      let factoryEntered = false;
      let factorySawAbort = false;

      const executor = provide((controller) => {
        factoryEntered = true;

        return new Promise((resolve, reject) => {
          if (controller.signal?.aborted) {
            factorySawAbort = true;
            reject(new AbortError());
            return;
          }

          const timeout = setTimeout(() => resolve("done"), 100);

          controller.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            factorySawAbort = true;
            reject(new AbortError());
          });
        });
      });

      const resolution = scope.resolve(executor);

      setTimeout(() => ext.controller.abort("immediate"), 10);

      await expect(resolution.toPromise()).rejects.toThrow("Operation aborted");
      expect(factoryEntered).toBe(true);
      expect(factorySawAbort).toBe(true);
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
});
