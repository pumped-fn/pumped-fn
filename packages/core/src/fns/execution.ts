import { StandardSchemaV1, validateInput } from "../standardschema";
import { ExecutionScope, ExecutionValue, Executor } from "../types";
import { createExecutor } from "./_internal";

let executionId = 0;

const nextExecutionId = () => {
  return `execution:${executionId++}`;
};

export function executionValue<V>(key: string | symbol, schema: StandardSchemaV1<V>): ExecutionValue<V> {
  const getter = createExecutor(
    { kind: "execution" },
    async (_, scope) => {
      if ("context" in scope) {
        const value = scope.context.get(key);
        return await validateInput(schema, value);
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
      if ("context" in scope) {
        const value = scope.context.get(key);
        if (value === undefined) {
          return undefined;
        }

        return await validateInput(schema, value);
      } else {
        return undefined;
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
