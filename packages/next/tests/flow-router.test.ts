import { describe, expect, it } from "vitest";
import { flow, custom, type Flow } from "../src/index";

describe("Flow Router Utilities", () => {
  const addTodoFlow = flow({
    name: "addTodo",
    input: custom<{ title: string; description: string }>(),
    output: custom<{ id: string; title: string; description: string }>(),
    handler: async (ctx, input) => {
      return { id: "1", ...input };
    },
  });

  const getTodoFlow = flow({
    name: "getTodo",
    input: custom<{ id: string }>(),
    output: custom<{ id: string; title: string; description: string }>(),
    handler: async (ctx, input) => {
      return { id: input.id, title: "Test", description: "Test description" };
    },
  });

  const addUserFlow = flow({
    name: "addUser",
    input: custom<{ name: string; email: string }>(),
    output: custom<{ id: string; name: string; email: string }>(),
    handler: async (ctx, input) => {
      return { id: "u1", ...input };
    },
  });

  const getUserFlow = flow({
    name: "getUser",
    input: custom<{ id: string }>(),
    output: custom<{ id: string; name: string; email: string }>(),
    handler: async (ctx, input) => {
      return { id: input.id, name: "John", email: "john@example.com" };
    },
  });

  const todoRouter = {
    addTodo: addTodoFlow,
    getTodo: getTodoFlow,
  };

  const userRouter = {
    addUser: addUserFlow,
    getUser: getUserFlow,
  };

  const routers = {
    todo: todoRouter,
    user: userRouter,
  };

  it("should infer valid paths from nested router", () => {
    type Paths = Flow.PathsToFlows<typeof routers>;

    const path1: Paths = "todo.addTodo";
    const path2: Paths = "todo.getTodo";
    const path3: Paths = "user.addUser";
    const path4: Paths = "user.getUser";

    expect(path1).toBe("todo.addTodo");
    expect(path2).toBe("todo.getTodo");
    expect(path3).toBe("user.addUser");
    expect(path4).toBe("user.getUser");
  });

  it("should extract flow from path", () => {
    type AddTodoFlowType = Flow.GetFlowFromPath<typeof routers, "todo.addTodo">;
    type GetUserFlowType = Flow.GetFlowFromPath<typeof routers, "user.getUser">;

    const flow1: AddTodoFlowType = addTodoFlow;
    const flow2: GetUserFlowType = getUserFlow;

    expect(flow1).toBe(addTodoFlow);
    expect(flow2).toBe(getUserFlow);
  });

  it("should infer input type from path", () => {
    type AddTodoInput = Flow.InferInputFromPath<typeof routers, "todo.addTodo">;
    type GetUserInput = Flow.InferInputFromPath<typeof routers, "user.getUser">;

    const todoInput: AddTodoInput = {
      title: "Test Todo",
      description: "Test Description",
    };

    const userInput: GetUserInput = {
      id: "u1",
    };

    expect(todoInput.title).toBe("Test Todo");
    expect(userInput.id).toBe("u1");
  });

  it("should infer output type from path", () => {
    type AddTodoOutput = Flow.InferOutputFromPath<typeof routers, "todo.addTodo">;
    type GetUserOutput = Flow.InferOutputFromPath<typeof routers, "user.getUser">;

    const todoOutput: AddTodoOutput = {
      id: "1",
      title: "Test Todo",
      description: "Test Description",
    };

    const userOutput: GetUserOutput = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(todoOutput.id).toBe("1");
    expect(userOutput.name).toBe("John");
  });

  it("should have correct type signature for router executor", () => {
    type ExecutorFn = Flow.FlowRouterExecutor<typeof routers>;

    const mockExecutor: ExecutorFn = null as any;

    type TestInput1 = Flow.InferInputFromPath<typeof routers, "todo.addTodo">;
    type TestOutput1 = Flow.InferOutputFromPath<typeof routers, "todo.addTodo">;

    type TestInput2 = Flow.InferInputFromPath<typeof routers, "user.getUser">;
    type TestOutput2 = Flow.InferOutputFromPath<typeof routers, "user.getUser">;

    const input1: TestInput1 = {
      title: "Test",
      description: "Description",
    };

    const output1: TestOutput1 = {
      id: "1",
      title: "Test",
      description: "Description",
    };

    const input2: TestInput2 = {
      id: "u1",
    };

    const output2: TestOutput2 = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(input1.title).toBe("Test");
    expect(output1.id).toBe("1");
    expect(input2.id).toBe("u1");
    expect(output2.email).toBe("john@example.com");
  });

  it("should work with single-level router", () => {
    const flatRouter = {
      addTodo: addTodoFlow,
      getTodo: getTodoFlow,
    };

    type Paths = Flow.PathsToFlows<typeof flatRouter>;
    type AddTodoInput = Flow.InferInputFromPath<typeof flatRouter, "addTodo">;
    type GetTodoOutput = Flow.InferOutputFromPath<typeof flatRouter, "getTodo">;

    const path: Paths = "addTodo";
    const input: AddTodoInput = {
      title: "Test",
      description: "Test description",
    };
    const output: GetTodoOutput = {
      id: "1",
      title: "Test",
      description: "Test description",
    };

    expect(path).toBe("addTodo");
    expect(input.title).toBe("Test");
    expect(output.id).toBe("1");
  });

  it("should work with deeply nested routers", () => {
    const deepRouter = {
      api: {
        v1: {
          todo: {
            add: addTodoFlow,
            get: getTodoFlow,
          },
          user: {
            add: addUserFlow,
            get: getUserFlow,
          },
        },
      },
    };

    type Paths = Flow.PathsToFlows<typeof deepRouter>;
    type AddTodoInput = Flow.InferInputFromPath<typeof deepRouter, "api.v1.todo.add">;
    type GetUserOutput = Flow.InferOutputFromPath<typeof deepRouter, "api.v1.user.get">;

    const path: Paths = "api.v1.todo.add";
    const input: AddTodoInput = {
      title: "Deep Todo",
      description: "Nested description",
    };
    const output: GetUserOutput = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(path).toBe("api.v1.todo.add");
    expect(input.title).toBe("Deep Todo");
    expect(output.email).toBe("john@example.com");
  });
});
