import { describe, it, expectTypeOf } from "vitest";
import type { Lite } from "../src/types";
import { flow } from "../src/flow";

describe("rawInput type safety", () => {
  it("rawInput accepts unknown type", () => {
    const myFlow = flow({
      parse: (raw: unknown): { name: string } => {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.name !== "string") throw new Error("name required");
        return { name: obj.name };
      },
      factory: (ctx) => ctx.input.name,
    });

    // Type test only - verify rawInput accepts unknown
    type ExecOptions = Lite.ExecFlowOptions<string, { name: string }>;
    expectTypeOf<{ flow: typeof myFlow; rawInput: unknown }>().toMatchTypeOf<ExecOptions>();
  });

  it("rejects both input and rawInput at type level", () => {
    const myFlow = flow({
      parse: (raw: unknown): string => String(raw),
      factory: (ctx) => ctx.input,
    });

    // This verifies types prevent both - the @ts-expect-error must be present
    type BothOptions = { flow: typeof myFlow; input: string; rawInput: string };

    // @ts-expect-error - cannot have both input and rawInput
    expectTypeOf<BothOptions>().toMatchTypeOf<Lite.ExecFlowOptions<string, string>>();
  });

  it("input and rawInput are mutually exclusive", () => {
    // When using input, rawInput should be never
    type WithInput = Lite.ExecFlowOptions<string, string> & { input: string };
    expectTypeOf<WithInput["rawInput"]>().toEqualTypeOf<never | undefined>();

    // When using rawInput, input should be never
    type WithRawInput = Lite.ExecFlowOptions<string, string> & { rawInput: unknown };
    expectTypeOf<WithRawInput["input"]>().toEqualTypeOf<never | undefined>();
  });
});
