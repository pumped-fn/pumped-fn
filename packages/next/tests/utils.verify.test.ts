import { describe, test, expect } from "vitest";
import { buildFlowScenario } from "./utils";

describe("Test Utils", () => {
  test("buildFlowScenario exports function", () => {
    expect(typeof buildFlowScenario).toBe("function");
  });
});
