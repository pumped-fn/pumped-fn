import { type Flow } from "../../src/types";
import { flow } from "../../src/flow";
import { createScope } from "../../src/scope";

export type FlowScenarioOptions<I, O> = {
  input: I;
  expected: O;
  flowDef?: Flow.Definition<O, I>;
  handler?: (ctx: any, input: I) => O | Promise<O>;
  extensions?: any[];
  scopeTags?: any[];
  executionTags?: any[];
};

export async function buildFlowScenario<I, O>(
  options: FlowScenarioOptions<I, O>
): Promise<{ result: O; scope?: ReturnType<typeof createScope> }> {
  const { input, handler, flowDef, extensions, scopeTags, executionTags } = options;

  const flowInstance = flowDef ? flow(flowDef, handler!) : flow(handler!);

  const result = await flow.execute(flowInstance, input, {
    extensions,
    scopeTags,
    executionTags,
  });

  return { result };
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
