import { describe, test, expect, vi } from "vitest";
import { flow } from "../src/flow";
import type { Extension } from "../src/types";
import { custom } from "../src/ssch";

describe("Extensions and Flow Execution", () => {
  describe("Flow Extension Execution", () => {
    test("demonstrates simple execution logging", async () => {
      const executionLogs: string[] = [];

      const loggingExtension: Extension.Extension = {
        name: "logging",
        wrapExecute: async (context, execute, execution) => {
          executionLogs.push(`Starting: ${execution.flowName}`);
          try {
            const result = await execute();
            executionLogs.push(`Completed: ${execution.flowName}`);
            return result;
          } catch (error) {
            executionLogs.push(`Failed: ${execution.flowName}`);
            throw error;
          }
        },
      };

      const basicFlow = flow.define({
        name: "basic-task",
        input: custom<{ value: number }>(),
        success: custom<{ result: number }>(),
        error: custom<{ error: string }>(),
      });

      const basicImpl = basicFlow.handler(async (ctx, input) => {
        return ctx.ok({ result: input.value * 2 });
      });

      const result = await flow.execute(basicImpl, { value: 5 }, {
        extensions: [loggingExtension],
      });

      expect(result.type).toBe("ok");
      if (result.type === "ok") {
        expect(result.data.result).toBe(10);
      }
      expect(executionLogs).toEqual([
        "Starting: basic-task",
        "Completed: basic-task"
      ]);
    });

    test("extension catches flow errors", async () => {
      const executionLogs: string[] = [];

      const loggingExtension: Extension.Extension = {
        name: "logging",
        wrapExecute: async (context, execute, execution) => {
          executionLogs.push(`Starting: ${execution.flowName}`);
          try {
            const result = await execute();
            executionLogs.push(`Completed: ${execution.flowName}`);
            return result;
          } catch (error) {
            executionLogs.push(`Failed: ${execution.flowName}`);
            throw error;
          }
        },
      };

      const errorFlow = flow.define({
        name: "error-task",
        input: custom<{ shouldFail: boolean }>(),
        success: custom<{ result: string }>(),
        error: custom<{ error: string }>(),
      });

      const errorImpl = errorFlow.handler(async (ctx, input) => {
        if (input.shouldFail) {
          throw new Error("Task failed");
        }
        return ctx.ok({ result: "success" });
      });

      try {
        await flow.execute(errorImpl, { shouldFail: true }, {
          extensions: [loggingExtension],
        });
      } catch (error: unknown) {
        expect((error as Error).message).toBe("Task failed");
      }

      expect(executionLogs).toEqual([
        "Starting: error-task",
        "Failed: error-task"
      ]);
    });
  });
});