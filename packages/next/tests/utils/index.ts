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
  flowName?: string;
  journalKey?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  params?: readonly unknown[];
  parallelMode?: string;
  promiseCount?: number;
};

export function createTrackingExtension(
  filter?: (kind: string) => boolean
): {
  ext: Extension.Extension;
  records: OperationRecord[];
} {
  const records: OperationRecord[] = [];

  const ext: Extension.Extension = {
    name: "tracker",
    wrap: (_scope, next, operation) => {
      if (filter && !filter(operation.kind)) {
        return next();
      }

      const record: OperationRecord = { kind: operation.kind };

      if (operation.kind === "execute") {
        record.flowName = operation.definition.name;
        record.input = operation.input;
      } else if (operation.kind === "journal") {
        record.journalKey = operation.key;
        record.params = operation.params;
      } else if (operation.kind === "subflow") {
        record.flowName = operation.definition.name;
        record.input = operation.input;
      } else if (operation.kind === "parallel") {
        record.parallelMode = operation.mode;
        record.promiseCount = operation.promiseCount;
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
