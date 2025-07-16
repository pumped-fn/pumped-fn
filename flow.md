## Using flow API. A flow is composed of

- Flow
  |_ flow
  |_ flow
  |_ flow
  |_ flow
  |\_ flow

## Flow type def

```typescript
export namespace Flow {
  export type Context = {};

  export type ExecutionPlugin = {};
  export type ExecuteOpt = {
    scope?: Core.Scope;
    name?: string;
    description?: string;
    plugins?: ExecutionPlugin[];
    presets?: Core.Preset<unknown>[];
  };

  export type Controller = {
    execute: <Input, Output>(
      input: Flow<Input, Output>,
      param: Input,
      opt?: ExecuteOpt
    ) => Promise<Output>;
    safeExecute: <Input, Output>(
      input: Flow<Input, Output>,
      param: Input,
      opt?: ExecuteOpt
    ) => Promise<Result<Output>>;
  };

  export type NoDependencyFlowFn<Input, Output> = (
    input: Input,
    context: Controller & { context: ExecutionContext }
  ) => Output | Promise<Output>;

  export type DependentFlowFn<D, Input, Output> = (
    dependency: D,
    input: Input,
    context: Controller & { context: ExecutionContext }
  ) => Output | Promise<Output>;

  export type FlowPlugin = {};

  export type Flow<Input, Output> = {
    execution: NoDependencyFlowFn<Input, Output>;
  } & Config &
    Schema<Input, Output>;

  export type Schema<Input, Output> = {
    input: StandardSchemaV1<Input>;
    output: StandardSchemaV1<Output>;
  };

  export type Config = {
    name?: string;
    description?: string;
    plugins?: FlowPlugin[];
    metas?: Meta.Meta[];
  };

  export type Executor<Input, Output> = Core.Executor<Flow<Input, Output>> &
    Config &
    Schema<Input, Output>;

  export type Metrics = {
    flowName?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    status: "pending" | "success" | "error" | "timeout" | "cancelled";
    error?: unknown;
    attempts?: number;
    retryDelays?: number[];
    inputSize?: number;
    outputSize?: number;
    timeout?: number;
  };

  export type ExecutionStats = {
    id: string;
    flowName?: string;
    parentId?: string;
    metrics: Metrics;
    children: ExecutionStats[];
  };

  export type ExecutionContext = {
    data: Record<string, any>;
  };

  export type Success<T> = { kind: "success"; value: T };
  export type Error = { kind: "error"; error: unknown };

  export type Result<T> = Success<T> | Error;

  export type ExecutionResult<Output> = {
    context: ExecutionContext;
    result: Result<Output>;
  };
}
```

```typescript
import { provideFlow, deriveFlow, execute, type Flow, type StandardSchemaV1 } from "@pumped-fn/core-next"

const db = derive(/** keep it short **/)
const logger = derive(/** keep it short **/)

const simpleFlow = provideFlow(
//    ^? Flow.Executor<infered return type>
  {
    input, output, // from Flow.Schema
    ...,name: "..." // from Flow.Config,
    ...metas ... /** metas can be added freely, for example name('value') */
  },
  async (input, controller) => {
    //          ^? Flow.Controller
    // flow code
  }
)

const derivedFlow = derive(
  {
    dependencies: [db, simpleFlow] | { db, simpleFlow } // similar to the `derive` API, can be executor, object or array
    ... // from Flow.Schema and Flow.Config
    ... /** metas can be added freely, for example name('value') */
  },
  async ({ db, simpleFlow }, input, controller) => {
  //     ^? resolved dependencies, similar to the `derive` API
  //                          ^? Flow.Controller

    controller.execute(simpleFlow, param, opts) // use controller to call sub flow
  }
)

// use execute to execute a flow. Execution will be executed resolved and executed within a pod. The pod derived from which scope depending on the opts
const result = await execute(derivedFlow, flowParam, {
//    ^? Flow.ExecutionResult
scope: Core.Scope // optional. Will create a new scope if not set. Great for testing
presets?: Core.Preset[] // to emulate values or placeholder. This preset will be inject into pod
} // opts)

```
