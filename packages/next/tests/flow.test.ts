import { provideFlow, deriveFlow, provide, derive, createScope, custom } from "../src";
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

  const userSvc = provide(() => ({
    get: (userId: number) => {
      if (userId === 1) {
        return { id: 1, name: "John Doe" };
      }
      throw new Error("User not found");
    },
    list: () => {
      return [{ id: 1, name: "John Doe" }];
    }
  }))

  const signupFlow = deriveFlow({
    dependencies: [auth, userSvc],
    input: custom<{ username: "string", password: "string" }>(),
    output: custom<{ userId: number, token: "string" }>(),
  }, async ([auth, userSvc], input) => {

    return auth.login(input.username, input.password);
  })

})