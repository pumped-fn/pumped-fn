import { describe, it, expect } from "vitest";
import { wrapWithExtensions } from "../../src/internal/extension-utils";
import { Promised } from "../../src/promises";
import { createScope } from "../../src/scope";
import { provide } from "../../src/executor";
import type { Extension, Core } from "../../src/types";

describe("wrapWithExtensions", () => {
  it("returns base executor when no extensions", () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1), scope, operation: "resolve" };

    const wrapped = wrapWithExtensions(undefined, base, scope, operation);

    expect(wrapped).toBe(base);
  });

  it("wraps executor with single extension", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1), scope, operation: "resolve" };
    const ext: Extension.Extension = {
      name: "test",
      wrap: (s, next, op) => Promised.create(next().then(v => (v as number + 1) as any))
    };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);
    const result = await wrapped();

    expect(result).toBe(43);
  });

  it("wraps in reverse order (last extension wraps first)", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(10));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1), scope, operation: "resolve" };
    const ext1: Extension.Extension = {
      name: "multiply",
      wrap: (s, next, op) => Promised.create(next().then(v => (v as number * 2) as any))
    };
    const ext2: Extension.Extension = {
      name: "add",
      wrap: (s, next, op) => Promised.create(next().then(v => (v as number + 5) as any))
    };

    const wrapped = wrapWithExtensions([ext1, ext2], base, scope, operation);
    const result = await wrapped();

    expect(result).toBe(30);
  });

  it("handles extensions without wrap method", () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1), scope, operation: "resolve" };
    const ext: Extension.Extension = { name: "no-wrap" };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);

    expect(wrapped).toBe(base);
  });

  it("converts non-Promised results to Promised", async () => {
    const scope = createScope();
    const base = () => Promised.create(Promise.resolve(42));
    const operation: Extension.Operation = { kind: "resolve", executor: provide(() => 1), scope, operation: "resolve" };
    const ext: Extension.Extension = {
      name: "returns-promise",
      wrap: (s, next, op) => next().then(v => Promise.resolve((v as number + 1) as any))
    };

    const wrapped = wrapWithExtensions([ext], base, scope, operation);
    const promisedResult = wrapped();

    expect(promisedResult).toBeInstanceOf(Promised);
    expect(await promisedResult).toBe(43);
  });
});
