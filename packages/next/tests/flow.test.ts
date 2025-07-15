import { provideFlow, deriveFlow, provide, derive, createScope, custom, execute, FlowError, preset } from "../src";
import { vi, test, describe, expect } from "vitest";

describe("flow test", () => {

  const auth = provide(() => ({
    login: (username: string, password: string) => {
      if (username === "user" && password === "pass") {
        return { userId: 1, token: "abc123" };
      }
      throw new Error("Invalid credentials");
    },
    logout: () => ({ success: true }),
  }))

  const userSvc = provide(() => {
    const store = new Map<number, { id: number, name: string }>();

    return ({
      get: (userId: number) => {
        if (store.has(userId)) {
          return store.get(userId);
        }

        throw new Error("User not found");
      },
      find: (name: string) => {
        for (const user of store.values()) {
          if (user.name === name) {
            return user;
          }
        }
      },
      list: () => {
        return Array.from(store.values());
      },
      create: (name: string) => {
        const id = store.size + 1;
        const user = { id, name };
        store.set(id, user);

        return user;
      },
    });
  })

  const createUser = deriveFlow({
    name: "createUserFlow",
    dependencies: [userSvc],
    input: custom<{ name: string }>(),
    output: custom<{ id: number, name: string }>(),
  }, async ([userSvc], input) => {
    return userSvc.create(input.name);
  })

  const signup = deriveFlow({
    name: "signupFlow",
    dependencies: [auth, userSvc, createUser],
    input: custom<{ username: string, password: string }>(),
    output: custom<{ userId: number, token: string }>(),
  }, async ([auth, userSvc, createUser], input, ctx) => {
    if (!userSvc.find(input.username)) {
      ctx.execute(createUser, { name: input.username });
    }
    
    return auth.login(input.username, input.password);
  })

  test("execution should work", async () => {
    const { context, result } = await execute(signup, { username: "user", password: "pass" })

    expect(result.kind).toBe("success");
  })

  test("nested flow execution", async () => {
    const getUserFlow = deriveFlow({
      name: "getUserFlow",
      dependencies: { userSvc },
      input: custom<{ userId: number }>(),
      output: custom<{ id: number, name: string }>(),
    }, async ({ userSvc }, input) => {
      return userSvc.get(input.userId);
    });

    const loginFlow = deriveFlow({
      name: "loginFlow",
      dependencies: { auth, getUserFlow },
      input: custom<{ username: string, password: string }>(),
      output: custom<{ user: { id: number, name: string }, token: string }>(),
    }, async ({ auth, getUserFlow }, input, controller) => {
      const authResult = auth.login(input.username, input.password);
      const user = await controller.execute(getUserFlow, { userId: authResult.userId });
      
      return {
        user,
        token: authResult.token
      };
    });

    const scope = createScope();
    const { result } = await execute(loginFlow, { username: "user", password: "pass" }, { scope });
    
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.token).toBe("abc123");
    }
    
    await scope.dispose();
  });

  test("error handling with FlowError", async () => {
    const errorFlow = provideFlow({
      name: "errorFlow",
      input: custom<{ shouldFail: boolean }>(),
      output: custom<{ message: string }>(),
    }, async (input) => {
      if (input.shouldFail) {
        throw new Error("Operation failed");
      }
      return { message: "Success" };
    });

    const { result } = await execute(errorFlow, { shouldFail: true });
    
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBeInstanceOf(FlowError);
      expect((result.error as FlowError).type).toBe("execution");
    }
  });

  test("safe execution with error recovery", async () => {
    const fallbackFlow = provideFlow({
      name: "fallbackFlow",
      input: custom<{ value: string }>(),
      output: custom<{ result: string }>(),
    }, async (input) => {
      return { result: `fallback-${input.value}` };
    });

    const mainFlow = deriveFlow({
      name: "mainFlow",
      dependencies: { errorFlow: errorFlow, fallbackFlow },
      input: custom<{ value: string }>(),
      output: custom<{ result: string }>(),
    }, async ({ errorFlow, fallbackFlow }, input, controller) => {
      const result = await controller.safeExecute(errorFlow, { shouldFail: true });
      
      if (result.kind === "error") {
        const fallbackResult = await controller.execute(fallbackFlow, { value: input.value });
        return fallbackResult;
      }
      
      return result.value;
    });

    const errorFlow = provideFlow({
      name: "errorFlow",
      input: custom<{ shouldFail: boolean }>(),
      output: custom<{ result: string }>(),
    }, async () => {
      throw new Error("Always fails");
    });

    const { result } = await execute(mainFlow, { value: "test" });
    
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.result).toBe("fallback-test");
    }
  });

  test("execution with presets", async () => {
    const configFlow = provide(() => ({ apiUrl: "https://api.example.com" }));
    
    const apiFlow = deriveFlow({
      name: "apiFlow",
      dependencies: { config: configFlow },
      input: custom<{ endpoint: string }>(),
      output: custom<{ url: string }>(),
    }, async ({ config }, input) => {
      return { url: `${config.apiUrl}${input.endpoint}` };
    });

    const mockConfig = preset(configFlow, { apiUrl: "https://mock.api.com" });
    const { result } = await execute(apiFlow, { endpoint: "/users" }, {
      presets: [mockConfig]
    });
    
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.url).toBe("https://mock.api.com/users");
    }
  });

  test("context sharing between flows", async () => {
    const contextFlow = provideFlow({
      name: "contextFlow",
      input: custom<{ key: string, value: string }>(),
      output: custom<{ stored: boolean }>(),
    }, async (input, controller) => {
      controller.context.data[input.key] = input.value;
      return { stored: true };
    });

    const readContextFlow = provideFlow({
      name: "readContextFlow",
      input: custom<{ key: string }>(),
      output: custom<{ value: string | undefined }>(),
    }, async (input, controller) => {
      return { value: controller.context.data[input.key] };
    });

    const orchestratorFlow = deriveFlow({
      name: "orchestratorFlow",
      dependencies: { contextFlow, readContextFlow },
      input: custom<{ data: string }>(),
      output: custom<{ retrieved: string | undefined }>(),
    }, async ({ contextFlow, readContextFlow }, input, controller) => {
      await controller.execute(contextFlow, { key: "myData", value: input.data });
      const result = await controller.execute(readContextFlow, { key: "myData" });
      return { retrieved: result.value };
    });

    const { result } = await execute(orchestratorFlow, { data: "test-value" });
    
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.retrieved).toBe("test-value");
    }
  });

})