import { describe, test, expect } from "vitest";
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

  const nestedRouters = {
    todo: todoRouter,
    user: userRouter,
  };

  test("PathsToFlows generates dot-notation paths from nested router", () => {
    type Paths = Flow.PathsToFlows<typeof nestedRouters>;

    const todoAddPath: Paths = "todo.addTodo";
    const todoGetPath: Paths = "todo.getTodo";
    const userAddPath: Paths = "user.addUser";
    const userGetPath: Paths = "user.getUser";

    expect(todoAddPath).toBe("todo.addTodo");
    expect(todoGetPath).toBe("todo.getTodo");
    expect(userAddPath).toBe("user.addUser");
    expect(userGetPath).toBe("user.getUser");
  });

  test("GetFlowFromPath extracts flow type from router path", () => {
    type AddTodoFlowType = Flow.GetFlowFromPath<typeof nestedRouters, "todo.addTodo">;
    type GetUserFlowType = Flow.GetFlowFromPath<typeof nestedRouters, "user.getUser">;

    const todoFlowInstance: AddTodoFlowType = addTodoFlow;
    const userFlowInstance: GetUserFlowType = getUserFlow;

    expect(todoFlowInstance).toBe(addTodoFlow);
    expect(userFlowInstance).toBe(getUserFlow);
  });

  test("InferInputFromPath extracts input type from router path", () => {
    type AddTodoInput = Flow.InferInputFromPath<typeof nestedRouters, "todo.addTodo">;
    type GetUserInput = Flow.InferInputFromPath<typeof nestedRouters, "user.getUser">;

    const validTodoInput: AddTodoInput = {
      title: "Test Todo",
      description: "Test Description",
    };
    const validUserInput: GetUserInput = {
      id: "u1",
    };

    expect(validTodoInput.title).toBe("Test Todo");
    expect(validUserInput.id).toBe("u1");
  });

  test("InferOutputFromPath extracts output type from router path", () => {
    type AddTodoOutput = Flow.InferOutputFromPath<typeof nestedRouters, "todo.addTodo">;
    type GetUserOutput = Flow.InferOutputFromPath<typeof nestedRouters, "user.getUser">;

    const validTodoOutput: AddTodoOutput = {
      id: "1",
      title: "Test Todo",
      description: "Test Description",
    };
    const validUserOutput: GetUserOutput = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(validTodoOutput.id).toBe("1");
    expect(validUserOutput.name).toBe("John");
  });

  test("FlowRouterExecutor provides type-safe executor function signature", () => {
    type ExecutorFn = Flow.FlowRouterExecutor<typeof nestedRouters>;

    const mockExecutor: ExecutorFn = null as any;
    type AddTodoInput = Flow.InferInputFromPath<typeof nestedRouters, "todo.addTodo">;
    type AddTodoOutput = Flow.InferOutputFromPath<typeof nestedRouters, "todo.addTodo">;
    type GetUserInput = Flow.InferInputFromPath<typeof nestedRouters, "user.getUser">;
    type GetUserOutput = Flow.InferOutputFromPath<typeof nestedRouters, "user.getUser">;

    const validTodoInput: AddTodoInput = {
      title: "Test",
      description: "Description",
    };
    const validTodoOutput: AddTodoOutput = {
      id: "1",
      title: "Test",
      description: "Description",
    };
    const validUserInput: GetUserInput = {
      id: "u1",
    };
    const validUserOutput: GetUserOutput = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(validTodoInput.title).toBe("Test");
    expect(validTodoOutput.id).toBe("1");
    expect(validUserInput.id).toBe("u1");
    expect(validUserOutput.email).toBe("john@example.com");
  });

  test("router types work with single-level flat structure", () => {
    const flatRouter = {
      addTodo: addTodoFlow,
      getTodo: getTodoFlow,
    };

    type Paths = Flow.PathsToFlows<typeof flatRouter>;
    type AddTodoInput = Flow.InferInputFromPath<typeof flatRouter, "addTodo">;
    type GetTodoOutput = Flow.InferOutputFromPath<typeof flatRouter, "getTodo">;

    const validPath: Paths = "addTodo";
    const validInput: AddTodoInput = {
      title: "Test",
      description: "Test description",
    };
    const validOutput: GetTodoOutput = {
      id: "1",
      title: "Test",
      description: "Test description",
    };

    expect(validPath).toBe("addTodo");
    expect(validInput.title).toBe("Test");
    expect(validOutput.id).toBe("1");
  });

  test("router types work with deeply nested multi-level structure", () => {
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

    const validPath: Paths = "api.v1.todo.add";
    const validInput: AddTodoInput = {
      title: "Deep Todo",
      description: "Nested description",
    };
    const validOutput: GetUserOutput = {
      id: "u1",
      name: "John",
      email: "john@example.com",
    };

    expect(validPath).toBe("api.v1.todo.add");
    expect(validInput.title).toBe("Deep Todo");
    expect(validOutput.email).toBe("john@example.com");
  });
});
