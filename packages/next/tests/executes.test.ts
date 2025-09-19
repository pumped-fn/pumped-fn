import { describe, test, expect, vi } from "vitest";
import {
  ok,
  ko,
  chain,
  chainAsync,
  map,
  mapAsync,
  unwrap,
  unwrapOrThrow,
  combine,
  Service,
  type Result,
} from "../src/executes";

describe("Result Helpers", () => {
  describe("Basic Result creation", () => {
    test("ok creates successful result", () => {
      const result = ok(42);
      expect(result.type).toBe("ok");
      expect(result.data).toBe(42);
      expect(result.isOk()).toBe(true);
      expect(result.isKo()).toBe(false);
    });

    test("ko creates error result", () => {
      const error = new Error("test error");
      const result = ko(error);
      expect(result.type).toBe("ko");
      expect(result.data).toBe(error);
      expect(result.isOk()).toBe(false);
      expect(result.isKo()).toBe(true);
    });
  });


  describe("chain operations", () => {
    test("chains successful operations", () => {
      const result1 = ok(5);
      const result2 = chain(result1, (x) => ok(x * 2));
      const result3 = chain(result2, (x) => ok(x.toString()));

      expect(result3.type).toBe("ok");
      expect(result3.data).toBe("10");
    });

    test("stops chain on error", () => {
      const result1 = ko(new Error("initial error"));
      const result2 = chain(result1, (x) => ok(x * 2));

      expect(result2.type).toBe("ko");
      expect(result2.data).toBeInstanceOf(Error);
    });

    test("chainAsync works with promises", async () => {
      const result1 = ok(5);
      const result2 = await chainAsync(result1, async (x) => ok(x * 2));

      expect(result2.type).toBe("ok");
      expect(result2.data).toBe(10);
    });
  });

  describe("map operations", () => {
    test("maps successful result", () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);

      expect(mapped.type).toBe("ok");
      expect(mapped.data).toBe(10);
    });

    test("preserves error in map", () => {
      const error = new Error("test error");
      const result = ko(error);
      const mapped = map(result, (x) => x * 2);

      expect(mapped.type).toBe("ko");
      expect(mapped.data).toBe(error);
    });

    test("catches errors in map function", () => {
      const result = ok(5);
      const mapped = map(result, () => {
        throw new Error("map error");
      });

      expect(mapped.type).toBe("ko");
      expect(mapped.data).toBeInstanceOf(Error);
    });

    test("mapAsync works with promises", async () => {
      const result = ok(5);
      const mapped = await mapAsync(result, async (x) => x * 2);

      expect(mapped.type).toBe("ok");
      expect(mapped.data).toBe(10);
    });
  });

  describe("utility functions", () => {
    test("unwrap returns value or default", () => {
      const success = ok(42);
      const error = ko(new Error("test"));

      expect(unwrap(success, 0)).toBe(42);
      expect(unwrap(error, 0)).toBe(0);
    });

    test("unwrapOrThrow returns value or throws", () => {
      const success = ok(42);
      const error = ko(new Error("test"));

      expect(unwrapOrThrow(success)).toBe(42);
      expect(() => unwrapOrThrow(error)).toThrow("test");
    });

    test("combine merges successful results", () => {
      const results = [ok(1), ok(2), ok(3)] as const;
      const combined = combine(results);

      expect(combined.type).toBe("ok");
      expect(combined.data).toEqual([1, 2, 3]);
    });

    test("combine fails on first error", () => {
      const error = new Error("test error");
      const results = [ok(1), ko(error), ok(3)] as const;
      const combined = combine(results);

      expect(combined.type).toBe("ko");
      expect(combined.data).toBe(error);
    });
  });

  describe("Service composition", () => {
    test("wraps service methods", () => {
      const service = {
        add: (a: number, b: number) => a + b,
        divide: (a: number, b: number) => {
          if (b === 0) throw new Error("Division by zero");
          return a / b;
        }
      };

      const wrappedService = Service.wrap(service);

      const successResult = wrappedService.add(5, 3);
      expect(successResult.type).toBe("ok");
      expect(successResult.data).toBe(8);

      const errorResult = wrappedService.divide(10, 0);
      expect(errorResult.type).toBe("ko");
      expect(errorResult.data).toBeInstanceOf(Error);
    });

    test("wraps async service methods", async () => {
      const service = {
        fetchUser: async (id: string) => ({ id, name: "John" }),
        saveUser: async (user: any) => {
          if (!user.name) throw new Error("Name required");
          return { ...user, saved: true };
        }
      };

      const wrappedService = Service.wrapAsync(service);

      const successResult = await wrappedService.fetchUser("123");
      expect(successResult.type).toBe("ok");
      expect(successResult.data).toEqual({ id: "123", name: "John" });

      const errorResult = await wrappedService.saveUser({});
      expect(errorResult.type).toBe("ko");
      expect(errorResult.data).toBeInstanceOf(Error);
    });

    test("withRetry retries failed operations", async () => {
      let attempts = 0;
      const service = {
        unreliableOperation: async () => {
          attempts++;
          if (attempts < 3) {
            return ko(new Error("Temporary failure"));
          }
          return ok("Success");
        }
      };

      const retryService = Service.withRetry(service, 3, 10);
      const result = await retryService.unreliableOperation();

      expect(result.type).toBe("ok");
      expect(result.data).toBe("Success");
      expect(attempts).toBe(3);
    });

    test("withRetry gives up after max retries", async () => {
      let attempts = 0;
      const service = {
        alwaysFails: async () => {
          attempts++;
          return ko(new Error("Always fails"));
        }
      };

      const retryService = Service.withRetry(service, 2, 10);
      const result = await retryService.alwaysFails();

      expect(result.type).toBe("ko");
      expect(attempts).toBe(3); // Initial + 2 retries
    });
  });

  describe("Real-world usage examples", () => {
    test("service composition without try-catch", async () => {
      const db = Service.wrapAsync({
        findUser: async (id: string) => ({ id, name: "John", email: "john@example.com" }),
        saveUser: async (user: any) => ({ ...user, id: Date.now().toString() })
      });

      const notification = Service.wrapAsync({
        sendEmail: async (to: string, subject: string) => ({ sent: true, to, subject })
      });

      // Compose operations without try-catch
      const userResult = await db.findUser("123");
      const emailResult = await chainAsync(userResult, async (user) => {
        return await notification.sendEmail(user.email, "Welcome!");
      });

      expect(emailResult.type).toBe("ok");
      expect(emailResult.data.sent).toBe(true);
    });
  });
});