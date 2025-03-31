import { vi, test, expect } from "vitest";
import { buildResolvePlan, createScope } from "../src/core";
import { Executor, mvalue, provide, reactiveResource, resource, safeRunFlow, value } from "../src";
import { executionValue } from "../src/fns/execution";
import { cast } from "./utils";

test("test execution plan", () => {
  const a = mvalue(1);
  const b = value(2);
  const ev = executionValue("test", cast<string>());
  const ev2 = executionValue("test2", cast<number>());

  const e = provide([a, b, ev.getter], ([a, b, ev]) => {});
  const er = resource([ev2.finder], ([ev]) => [ev, () => {}]);
  const err = reactiveResource([ev2.getter], ([ev]) => [ev, () => {}]);

  const ekr = provide(err, (err) => {});

  const c = provide(a, (a) => a + 1);
  const d = provide(b, (b) => b + 1);

  const k = provide([e, c, d, er, err], ([e, c, d, er, err]) => {});

  const built = buildResolvePlan(k);

  function expectResolve(e: Executor<any>, target: "execution" | "scope") {
    const x = built.find((x) => x.executor === e);

    expect(x).toBeDefined();
    expect(x?.target).toBe(target);
  }

  expectResolve(a, "scope");
  expectResolve(b, "scope");
  expectResolve(ev.getter, "execution");
  expectResolve(ev2.finder, "execution");
  expectResolve(err, "execution");
  expect(c, "scope");
  expect(d, "scope");
  expect(k, "execution");
  expect(ekr, "execution");
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
