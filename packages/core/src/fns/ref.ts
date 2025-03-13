import { Executor, executorSymbol } from "../types";

let refId = 0;
const nextRefId = () => `ref:${refId++}`;

export const ref = <T>(executor: Executor<T>): Executor<Executor<T>> => {
  return {
    factory: async (_, scope) => {
      await scope.resolve(executor);

      return executor;
    },
    id: nextRefId(),
    dependencies: [],
    [executorSymbol]: {
      kind: "reference",
      to: [executor],
    },
  };
};
