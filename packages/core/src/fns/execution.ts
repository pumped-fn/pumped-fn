import { StandardSchemaV1, validateInput } from "../standardschema";
import { ExecutionScope, ExecutionValue, Executor, isExecutor } from "../types";
import { createExecutor } from "./_internal";

let executionId = 0;

const nextExecutionId = () => {
  return `execution:${executionId++}`;
};

export function executionValue<V>(
  key: string | symbol,
  schema: StandardSchemaV1<V>,
  fallback?: V | Executor<V>,
): ExecutionValue<V> {
  const getter = createExecutor(
    { kind: "execution" },
    async (_, scope) => {
      if ("context" in scope) {
        if (scope.context.has(key)) {
          const value = scope.context.get(key);
          return await validateInput(schema, value);
        } else if (fallback) {
          if (isExecutor(fallback)) {
            return await validateInput(schema, await scope.resolve(fallback));
          } else {
            return await validateInput(schema, fallback);
          }
        }

        throw new Error(`execution value "${String(key)}" is not set in ExecutionContext`);
      } else {
        throw new Error("execution value can only be operated inside ExecutionScope");
      }
    },
    undefined,
    nextExecutionId(),
    undefined,
  );

  const finder = createExecutor(
    { kind: "execution-optional" },
    async (_, scope) => {
      if ("context" in scope && scope.context.has(key)) {
        const value = scope.context.get(key);
        return await validateInput(schema, value);
      } else {
        return isExecutor(fallback) ? await scope.resolve(fallback) : fallback;
      }
    },
    undefined,
    nextExecutionId(),
    undefined,
  );

  const setter = createExecutor(
    { kind: "execution" },
    (_, scope) => {
      if ("context" in scope) {
        return (value: V) => {
          scope.context.set(key, value);
        };
      } else {
        throw new Error("execution value can only be operated inside ExecutionScope");
      }
    },
    undefined,
    nextExecutionId(),
    undefined,
  );

  const preset = (value: V) => (scope: ExecutionScope) => {
    if ("context" in scope) {
      scope.context.set(key, value);
    } else {
      throw new Error("execution value can only be operated inside ExecutionScope");
    }
  };

  return {
    getter,
    setter,
    preset,
    finder,
  };
}
