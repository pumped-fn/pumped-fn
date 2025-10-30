import { describe, it, expect } from "vitest";
import { AbortError } from "../src/errors";
import { type Core } from "../src/types";
import { createCancellationExtension } from "../src/cancellation";
import { createScope } from "../src/scope";
import { provide } from "../src";

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

  it("allows in-flight operations to complete", async () => {
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
});
