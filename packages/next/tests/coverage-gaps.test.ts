import { describe, test, expect } from "vitest";
import { custom, validate } from "../src/ssch";
import { createScope } from "../src/scope";
import { provide } from "../src/executor";
import { flow } from "../src/flow";
import { resolves } from "../src/helpers";
import {
  getExecutorName,
  createFactoryError,
  createDependencyError,
  createSystemError,
} from "../src/errors";
import { Promised } from "../src/promises";

describe("Coverage Gaps", () => {
  describe("helpers.ts - resolves function", () => {
    test.each([
      { desc: "array of executors", input: () => [provide(() => 1), provide(() => 2), provide(() => 3)], expected: [1, 2, 3] },
      { desc: "object of executors", input: () => ({ a: provide(() => 1), b: provide(() => "hello") }), expected: { a: 1, b: "hello" } },
      { desc: "array with escapable", input: () => [provide(() => 1), { escape: () => provide(() => 2) }], expected: [1, 2] },
      { desc: "object with escapable", input: () => ({ value: { escape: () => provide(() => 42) } }), expected: { value: 42 } },
      { desc: "lazy executor", input: () => [provide(() => 10).lazy], expected: [10] },
      { desc: "reactive executor", input: () => [provide(() => 20).reactive], expected: [20] },
      { desc: "static executor", input: () => [provide(() => 30).static], expected: [30] },
    ])("resolves $desc", async ({ input, expected }) => {
      const scope = createScope();
      const result = await resolves(scope, input() as any);
      expect(result).toEqual(expected);
      await scope.dispose();
    });
  });

  describe("promises.ts - uncovered lines", () => {
    test("Promised.all with mixed Promised and regular values", async () => {
      const p1 = Promised.create(Promise.resolve(1));
      const p2 = 2;
      const p3 = Promised.create(Promise.resolve(3));

      const result = await Promised.all([p1, p2, p3]);

      expect(result).toEqual([1, 2, 3]);
    });

    test("Promised.race with Promised instances", async () => {
      const p1 = Promised.create(Promise.resolve(1));
      const p2 = Promised.create(
        new Promise((resolve) => setTimeout(() => resolve(2), 100))
      );

      const result = await Promised.race([p1, p2]);

      expect(result).toBe(1);
    });

    test("Promised.try with synchronous error", async () => {
      const promised = Promised.try(() => {
        throw new Error("sync error");
      });

      await expect(promised.toPromise()).rejects.toThrow("sync error");
    });
  });

  describe("ssch.ts - validation error paths", () => {
    test("validate throws error when schema validation returns promise", () => {
      const asyncSchema = {
        "~standard": {
          vendor: "test",
          version: 1 as const,
          validate: () => Promise.resolve({ value: "async" }),
        },
      };

      expect(() => {
        validate(asyncSchema, "test");
      }).toThrow("validating async is not supported");
    });

    test("validate throws SchemaError when validation returns issues", () => {
      const failingSchema = {
        "~standard": {
          vendor: "test",
          version: 1 as const,
          validate: () => ({
            issues: [{ message: "validation failed" }],
          }),
        },
      };

      expect(() => {
        validate(failingSchema, "test");
      }).toThrow("validation failed");
    });
  });
});
