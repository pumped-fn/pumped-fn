import { executorSymbol, MutableExecutor, Scope } from "../types";

let mutableId = 0;

const nextMutableId = () => {
  return `mutable:${mutableId++}`;
};

export function mutable<P>(factory: (scope: Scope) => P): MutableExecutor<P> {
  return {
    [executorSymbol]: { kind: "mutable" },
    factory: (_, scope) => factory(scope),
    dependencies: [],
    id: nextMutableId(),
  };
}
