import { Executor, executorSymbol, ReferenceExecutor } from "../types";

let refId = 0;
const nextRefId = () => `ref:${refId++}`;

export const ref = <T extends Executor<unknown>>(executor: T): ReferenceExecutor<T> => {
  return {
    factory: async (_, scope) => {
      await scope.resolve(executor);

      return executor;
    },
    id: nextRefId(),
    dependencies: [],
    [executorSymbol]: {
      kind: "reference",
    },
  };
};
