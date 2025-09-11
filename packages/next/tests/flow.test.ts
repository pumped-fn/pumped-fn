import { flow, provide, createScope, custom, preset, FlowError } from "../src";
import { test, describe, expect } from "vitest";

describe("flow test", () => {
  const auth = provide(() => ({
    login: (username: string, password: string) => {
      if (username === "user" && password === "pass") {
        return { userId: 1, token: "abc123" };
      }
      throw new Error("Invalid credentials");
    },
    logout: () => ({ success: true }),
  }));

  const userSvc = provide(() => {
    const store = new Map<number, { id: number; name: string }>([
      [1, { id: 1, name: "user" }],
      [2, { id: 2, name: "admin" }],
    ]);

    return {
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
    };
  });

  const createUser = flow.derive(
    {
      name: "createUserFlow",
      dependencies: [userSvc],
      input: custom<{ name: string }>(),
      output: custom<{ id: number; name: string }>(),
    },
    async ([userSvc], input, ctl) => {
      return userSvc.create(input.name);
    }
  );

  const signup = flow.derive(
    {
      name: "signupFlow",
      dependencies: [auth, userSvc, createUser],
      input: custom<{ username: string; password: string }>(),
      output: custom<{ userId: number; token: string }>(),
    },
    async ([auth, userSvc, createUser], input, ctx) => {
      if (!userSvc.find(input.username)) {
        ctx.execute(createUser, { name: input.username });
      }

      return auth.login(input.username, input.password);
    }
  );

  test("execution should work", async () => {
    const { context, result } = await flow.execute(signup, {
      username: "user",
      password: "pass",
    });

    expect(result.kind).toBe("success");
  });

  test("nested flow execution", async () => {
    const getUserFlow = flow.derive(
      {
        name: "getUserFlow",
        dependencies: { userSvc },
        input: custom<{ userId: number }>(),
        output: custom<{ id: number; name: string }>(),
      },
      async ({ userSvc }, input) => {
        return userSvc.get(input.userId);
      }
    );

    const loginFlow = flow.derive(
      {
        name: "loginFlow",
        dependencies: { auth, getUserFlow },
        input: custom<{ username: string; password: string }>(),
        output: custom<{ user: { id: number; name: string }; token: string }>(),
      },
      async ({ auth, getUserFlow }, input, controller) => {
        const authResult = auth.login(input.username, input.password);
        const user = await controller.execute(getUserFlow, {
          userId: authResult.userId,
        });

        return {
          user,
          token: authResult.token,
        };
      }
    );

    const scope = createScope();
    const { result } = await flow.execute(
      loginFlow,
      { username: "user", password: "pass" },
      { scope }
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.token).toBe("abc123");
    }

    await scope.dispose();
  });

  test("error handling with FlowError", async () => {
    const errorFlow = flow.provide(
      {
        name: "errorFlow",
        input: custom<{ shouldFail: boolean }>(),
        output: custom<{ message: string }>(),
      },
      async (input) => {
        if (input.shouldFail) {
          throw new Error("Operation failed");
        }
        return { message: "Success" };
      }
    );

    const { result } = await flow.execute(errorFlow, { shouldFail: true });

    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toBeInstanceOf(FlowError);
    }
  });

  test("safe execution with error recovery", async () => {
    const fallbackFlow = flow.provide(
      {
        name: "fallbackFlow",
        input: custom<{ value: string }>(),
        output: custom<{ result: string }>(),
      },
      async (input) => {
        return { result: `fallback-${input.value}` };
      }
    );

    const errorFlow = flow.provide(
      {
        name: "errorFlow",
        input: custom<{ shouldFail: boolean }>(),
        output: custom<{ result: string }>(),
      },
      async () => {
        throw new Error("Always fails");
      }
    );

    const mainFlow = flow.derive(
      {
        name: "mainFlow",
        dependencies: { errorFlow: errorFlow, fallbackFlow },
        input: custom<{ value: string }>(),
        output: custom<{ result: string }>(),
      },
      async ({ errorFlow, fallbackFlow }, input, controller) => {
        const result = await controller.safeExecute(errorFlow, {
          shouldFail: true,
        });

        if (result.kind === "error") {
          const fallbackResult = await controller.execute(fallbackFlow, {
            value: input.value,
          });
          return fallbackResult;
        }

        return result.value;
      }
    );

    const { result } = await flow.execute(mainFlow, { value: "test" }, {});

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.result).toBe("fallback-test");
    }
  });

  test("execution with presets", async () => {
    const config = provide(() => ({ apiUrl: "https://api.example.com" }));

    const apiFlow = flow.derive(
      {
        name: "apiFlow",
        dependencies: { config: config },
        input: custom<{ endpoint: string }>(),
        output: custom<{ url: string }>(),
      },
      async ({ config }, input) => {
        return { url: `${config.apiUrl}${input.endpoint}` };
      }
    );

    const mockConfig = preset(config, { apiUrl: "https://mock.api.com" });
    const { result } = await flow.execute(
      apiFlow,
      { endpoint: "/users" },
      {
        presets: [mockConfig],
      }
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.url).toBe("https://mock.api.com/users");
    }
  });

  test("context nesting and isolation between flows", async () => {
    // Define child flow first
    const childFlow = flow.provide(
      {
        name: "childFlow",
        input: custom<{ childValue: string }>(),
        output: custom<{
          result: string;
          inheritedValue?: string;
          ownValue: string;
        }>(),
      },
      async (input, controller) => {
        // Child should inherit parent's data via Map copy
        const inheritedValue = controller.context.data.get(
          "parentValue"
        ) as any;
        const inheritedLevel = controller.context.data.get("level") as any; // Read from parent

        // Child sets its own data (overrides parent if same key)
        controller.context.data.set("childValue", input.childValue);
        controller.context.data.set("level", "child"); // Overrides parent's level

        return {
          result: `child:${input.childValue}, inherited:${inheritedValue}, parentLevel:${inheritedLevel}`,
          inheritedValue,
          ownValue: controller.context.data.get("level") as any,
        };
      }
    );

    // Define parent flow with child as dependency
    const parentFlow = flow.derive(
      {
        name: "parentFlow",
        dependencies: { childFlow },
        input: custom<{ value: string }>(),
        output: custom<{
          parentData: string;
          childData: any;
          parentLevelAfter: string;
        }>(),
      },
      async ({ childFlow }, input, controller) => {
        // Set data in parent context
        controller.context.data.set("parentValue", input.value);
        controller.context.data.set("level", "parent");

        // Execute child flow - it's already resolved
        const childResult = await controller.execute(childFlow, {
          childValue: "nested",
        });

        // Parent context should not be polluted by child's modifications
        expect(controller.context.data.get("childValue")).toBeUndefined();
        expect(controller.context.data.get("level")).toBe("parent"); // Not affected by child's override

        return {
          parentData: controller.context.data.get("parentValue"),
          childData: childResult as any,
          parentLevelAfter: controller.context.data.get("level"),
        };
      }
    );

    const { result } = await flow.execute(parentFlow, { value: "root" });

    if (result.kind === "error") {
      console.error("Test failed with error:", result.error);
    }

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.parentData).toBe("root");
      expect(result.value.childData.result).toBe(
        "child:nested, inherited:root, parentLevel:parent"
      );
      expect(result.value.childData.inheritedValue).toBe("root");
      expect(result.value.childData.ownValue).toBe("child");
      expect(result.value.parentLevelAfter).toBe("parent");
    }
  });
});
