import { describe, test, expect } from "vitest";
import { custom, validate } from "../src/ssch";
import { createScope } from "../src/scope";
import { createExecutor, derive, provide } from "../src/executor";
import { flow } from "../src/flow";
import { resolves } from "../src/helpers";
import {
  getExecutorName,
  createFactoryError,
  createDependencyError,
  createSystemError,
} from "../src/errors";
import { tag } from "../src/tag";
import { Promised } from "../src/promises";
import { withScope } from "./helpers";

describe("Coverage Gaps", () => {
  describe("scope.ts - error paths", () => {
    test("scope.useExtension throws when scope is disposing", async () => {
      const scope = createScope();
      const extension = { name: "test", init: () => {} };

      const disposePromise = scope.dispose();

      expect(() => scope.useExtension(extension)).toThrow(
        "Cannot register extension on a disposing scope"
      );

      await disposePromise;
    });

    test("scope methods throw when scope is disposed", async () => {
      const scope = createScope();
      await scope.dispose();

      expect(() => scope.resolve(provide(() => 1))).toThrow("Scope is disposed");
    });
  });
});
