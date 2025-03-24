import { vi, test, expect } from "vitest";
import { buildResolvePlan, createScope } from "../src/core";
import { mvalue, provide, safeRunFlow, value } from "../src";
import { executionValue } from "../src/fns/execution";
import { cast } from "./utils";

test("test execution plan", () => {
  const execution = "execution";
  const scope = "scope";

  const a = mvalue(1);
  const b = value(2);
  const ev = executionValue("test", cast<string>());

  const e = provide([a, b, ev.getter], ([a, b, ev]) => {});

  const c = provide(a, (a) => a + 1);
  const d = provide(b, (b) => b + 1);

  const k = provide([e, c, d], ([e, c, d]) => {});

  const [p1, p2, p3, p4, p5, p6, p7] = buildResolvePlan(k);

  console.log([p1, p2, p3, p4, p5, p6, p7]);
  expect(p7.target).toBe(execution);
  expect(p7.executor).toBe(k);
});

test("execute the flow", async () => {
  const requestId = executionValue("requestId", cast<string>());
  const userId = executionValue("userId", cast<string>());

  const logger = provide(requestId.getter, (requestId) => {
    return (message: string) => {
      console.log(`[${requestId}] ${message}`);
    };
  });

  const authy = provide([userId.getter, logger], ([userId, logger]) => {
    return async () => {
      logger(`authenticating user ${userId}`);
      return userId === "admin";
    };
  });

  const scope = createScope();

  let result = await safeRunFlow(scope, authy, requestId.preset("helloworld"), userId.preset("admin"));

  expect(result.status === "ok").toBeTruthy();
  expect(await result.value?.()).toBeTruthy();

  result = await safeRunFlow(scope, authy, requestId.preset("helloworld"), userId.preset("user"));

  expect(result.status === "ok").toBeTruthy();
  expect(await result.value?.()).toBeFalsy();
});
