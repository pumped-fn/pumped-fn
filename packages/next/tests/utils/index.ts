import { type Flow, type Extension, type Tag } from "../../src/types";
import { flow } from "../../src/flow";
import { createScope } from "../../src/scope";

export type FlowScenarioOptions<I, O> = {
  input: I;
  flowDef?: Flow.Definition<O, I>;
  handler?: (ctx: Flow.Context, input: I) => O | Promise<O>;
  extensions?: Extension.Extension[];
  scopeTags?: Tag.Tagged[];
  executionTags?: Tag.Tagged[];
};

export async function buildFlowScenario<I, O>(
  options: FlowScenarioOptions<I, O>
): Promise<O> {
  const { input, handler, flowDef, extensions, scopeTags, executionTags } = options;

  if (!handler && !flowDef) {
    throw new Error("Either handler or flowDef must be provided");
  }

  const flowInstance = flowDef && handler
    ? flow(flowDef, handler)
    : flowDef
      ? flow(flowDef, ((ctx: Flow.Context, input: I) => input as unknown as O))
      : handler
        ? flow(handler)
        : (null as never);

  const result = await flow.execute(flowInstance, input, {
    extensions,
    scopeTags,
    executionTags,
  });

  return result;
}

export function createScopeWithCleanup(): {
  scope: ReturnType<typeof createScope>;
  cleanup: () => Promise<void>;
} {
  const scope = createScope();
  return {
    scope,
    cleanup: async () => {
      await scope.dispose();
    },
  };
}
