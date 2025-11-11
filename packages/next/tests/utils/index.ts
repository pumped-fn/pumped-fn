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

export function expectResolved<T>(result: PromiseSettledResult<T>): {
  toBe: (expected: T) => void;
  toEqual: (expected: T) => void;
} {
  if (result.status !== "fulfilled") {
    throw new Error(`Expected fulfilled promise, got ${result.status}`);
  }

  return {
    toBe: (expected: T) => {
      if (result.value !== expected) {
        throw new Error(`Expected ${expected}, got ${result.value}`);
      }
    },
    toEqual: (expected: T) => {
      const actual = JSON.stringify(result.value);
      const exp = JSON.stringify(expected);
      if (actual !== exp) {
        throw new Error(`Expected ${exp}, got ${actual}`);
      }
    },
  };
}

export function expectRejected(result: PromiseSettledResult<unknown>): {
  withMessage: (message: string) => void;
} {
  if (result.status !== "rejected") {
    throw new Error(`Expected rejected promise, got ${result.status}`);
  }

  return {
    withMessage: (message: string) => {
      const errorMessage = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      if (!errorMessage.includes(message)) {
        throw new Error(`Expected error message to include "${message}", got "${errorMessage}"`);
      }
    },
  };
}

export type OperationRecord = {
  kind: string;
  targetType?: "flow" | "fn" | "parallel";
  flowName?: string;
  key?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  params?: readonly unknown[];
  parallelMode?: string;
  count?: number;
};

export function createTrackingExtension(
  filter?: (kind: string, operation: Extension.Operation) => boolean
): {
  ext: Extension.Extension;
  records: OperationRecord[];
} {
  const records: OperationRecord[] = [];

  const ext: Extension.Extension = {
    name: "tracker",
    wrap: (_scope, next, operation) => {
      if (filter && !filter(operation.kind, operation)) {
        return next();
      }

      const record: OperationRecord = { kind: operation.kind };

      if (operation.kind === "execution") {
        record.targetType = operation.target.type;
        record.input = operation.input;
        record.key = operation.key;

        if (operation.target.type === "flow") {
          record.flowName = operation.target.definition.name;
        } else if (operation.target.type === "fn") {
          record.params = operation.target.params;
        } else if (operation.target.type === "parallel") {
          record.parallelMode = operation.target.mode;
          record.count = operation.target.count;
        }
      }

      return next()
        .then((result) => {
          record.output = result;
          records.push(record);
          return result;
        })
        .catch((error) => {
          record.error = error;
          records.push(record);
          throw error;
        });
    },
  };

  return { ext, records };
}
