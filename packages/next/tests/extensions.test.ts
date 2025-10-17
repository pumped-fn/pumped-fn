import { describe, test, expect, vi } from "vitest";
import { flow, provide, extension } from "../src";
import type { Extension } from "../src/types";

describe("Extension Operation Tracking", () => {
  test("extension captures journal operations with parameters and outputs", async () => {
    type JournalRecord = {
      key: string;
      params?: readonly unknown[];
      output?: unknown;
    };

    const capturedJournalRecords: JournalRecord[] = [];

    const journalCaptureExtension = extension({
      name: "journal-capture",
      wrap: (_ctx, next, operation) => {
        if (operation.kind === "journal") {
          const record: JournalRecord = {
            key: operation.key,
            params: operation.params,
          };

          return next()
            .then((result) => {
              record.output = result;
              capturedJournalRecords.push(record);
              return result;
            })
            .catch((error) => {
              capturedJournalRecords.push(record);
              throw error;
            });
        }
        return next();
      },
    });

    const mathCalculationFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.run("multiply", (a: number, b: number) => a * b, input.x, input.y);
      const sum = await ctx.run("add", (a: number, b: number) => a + b, input.x, input.y);
      const combined = await ctx.run("combine", () => product + sum);

      return { product, sum, combined };
    });

    const result = await flow.execute(
      mathCalculationFlow,
      { x: 5, y: 3 },
      { extensions: [journalCaptureExtension] }
    );

    expect(result).toEqual({ product: 15, sum: 8, combined: 23 });
    expect(capturedJournalRecords).toHaveLength(3);
    expect(capturedJournalRecords[0]).toEqual({ key: "multiply", params: [5, 3], output: 15 });
    expect(capturedJournalRecords[1]).toEqual({ key: "add", params: [5, 3], output: 8 });
    expect(capturedJournalRecords[2]).toEqual({ key: "combine", params: undefined, output: 23 });
  });

  test("extension intercepts flow execution and subflow inputs", async () => {
    const capturedFlowInputs: Array<{ operation: string; input: unknown }> = [];

    const inputCaptureExtension = extension({
      name: "input-capture",
      wrap: (_ctx, next, operation) => {
        if (operation.kind === "execute" || operation.kind === "subflow") {
          capturedFlowInputs.push({
            operation: `${operation.kind}:${operation.definition.name}`,
            input: operation.input,
          });
        }
        return next();
      },
    });

    const incrementFlow = flow((_ctx, x: number) => x + 1);
    const doubleFlow = flow((_ctx, x: number) => x * 2);

    const composedFlow = flow(async (ctx, input: { value: number }) => {
      const incremented = await ctx.exec(incrementFlow, input.value);
      const doubled = await ctx.exec(doubleFlow, incremented);

      return { original: input.value, result: doubled };
    });

    const result = await flow.execute(
      composedFlow,
      { value: 5 },
      { extensions: [inputCaptureExtension] }
    );

    expect(result).toEqual({ original: 5, result: 12 });
    expect(capturedFlowInputs).toEqual([
      { operation: "execute:anonymous", input: { value: 5 } },
      { operation: "subflow:anonymous", input: 5 },
      { operation: "execute:anonymous", input: 5 },
      { operation: "subflow:anonymous", input: 6 },
      { operation: "execute:anonymous", input: 6 },
    ]);
  });

  test("extension tracks all operation kinds including parallel execution and errors", async () => {
    type OperationRecord = {
      kind: string;
      flowName?: string;
      journalKey?: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
      parallelMode?: string;
      promiseCount?: number;
    };

    const capturedOperations: OperationRecord[] = [];

    const comprehensiveTracker = extension({
      name: "tracker",
      wrap: (_ctx, next, operation) => {
        const record: OperationRecord = { kind: operation.kind };

        if (operation.kind === "execute") {
          record.flowName = operation.definition.name;
          record.input = operation.input;
        } else if (operation.kind === "journal") {
          record.journalKey = operation.key;
        } else if (operation.kind === "subflow") {
          record.flowName = operation.definition.name;
          record.input = operation.input;
        } else if (operation.kind === "parallel") {
          record.parallelMode = operation.mode;
          record.promiseCount = operation.promiseCount;
        }

        return next()
          .then((result) => {
            record.output = result;
            capturedOperations.push(record);
            return result;
          })
          .catch((error) => {
            record.error = error;
            capturedOperations.push(record);
            throw error;
          });
      },
    });

    const mockApi = provide(() => ({
      multiply: vi.fn((x: number) => x * 2),
      add: vi.fn((x: number) => x + 10),
      fail: vi.fn(() => {
        throw new Error("Intentional failure");
      }),
    }));

    const multiplyFlow = flow({ api: mockApi }, async ({ api }, ctx, input: number) => {
      return await ctx.run("multiply-op", () => api.multiply(input));
    });

    const addFlow = flow({ api: mockApi }, async ({ api }, ctx, input: number) => {
      return await ctx.run("add-op", () => api.add(input));
    });

    const parallelComputationFlow = flow({ api: mockApi }, async ({ api: _api }, ctx, input: number) => {
      const [multiplied, added] = await ctx
        .parallel([ctx.exec(multiplyFlow, input), ctx.exec(addFlow, input)])
        .then((r) => r.results);

      const combined = await ctx.run("combine", () => multiplied + added);

      return { multiplied, added, combined };
    });

    const result = await flow.execute(parallelComputationFlow, 5, { extensions: [comprehensiveTracker] });

    expect(result).toEqual({ multiplied: 10, added: 15, combined: 25 });

    const executeOperations = capturedOperations.filter((r) => r.kind === "execute");
    expect(executeOperations).toHaveLength(3);
    expect(executeOperations[0].input).toBe(5);

    const parallelOperations = capturedOperations.filter((r) => r.kind === "parallel");
    expect(parallelOperations).toHaveLength(1);
    expect(parallelOperations[0].parallelMode).toBe("parallel");
    expect(parallelOperations[0].promiseCount).toBe(2);

    const journalOperations = capturedOperations.filter((r) => r.kind === "journal");
    expect(journalOperations.some((r) => r.journalKey === "multiply-op" && r.output === 10)).toBe(true);
    expect(journalOperations.some((r) => r.journalKey === "add-op" && r.output === 15)).toBe(true);
    expect(journalOperations.some((r) => r.journalKey === "combine" && r.output === 25)).toBe(true);

    capturedOperations.length = 0;

    const failingFlow = flow({ api: mockApi }, async ({ api }, ctx, _input: number) => {
      await ctx.run("fail-op", () => api.fail());
    });

    await expect(flow.execute(failingFlow, 1, { extensions: [comprehensiveTracker] })).rejects.toThrow(
      "Intentional failure"
    );

    const errorOperation = capturedOperations.find((r) => r.kind === "journal");
    expect(errorOperation?.error).toBeDefined();
    expect((errorOperation?.error as Error).message).toBe("Intentional failure");
  });

  test("practical e-commerce order processing demonstrates complex flow composition", async () => {
    type Order = { orderId: string; items: string[]; total: number };

    const ecommerceServices = provide(() => ({
      validateOrder: vi.fn((order: Order) => {
        if (order.items.length === 0) throw new Error("Order has no items");
        return { valid: true, orderId: order.orderId };
      }),
      checkInventory: vi.fn((items: string[]) => {
        const unavailable = items.filter((item) => item === "out-of-stock");
        if (unavailable.length > 0) throw new Error(`Items unavailable: ${unavailable.join(", ")}`);
        return { available: true, items };
      }),
      chargePayment: vi.fn((orderId: string, amount: number) => ({
        transactionId: `txn-${orderId}`,
        charged: amount,
      })),
      reserveInventory: vi.fn((items: string[]) => ({ reserved: true, items })),
      updateOrderStatus: vi.fn((orderId: string, status: string) => ({
        orderId,
        status,
        updatedAt: new Date().toISOString(),
      })),
    }));

    const validateOrderFlow = flow(ecommerceServices, async (services, ctx, order: Order) => {
      return await ctx.run("validate", () => services.validateOrder(order));
    });

    const checkInventoryFlow = flow(ecommerceServices, async (services, ctx, items: string[]) => {
      return await ctx.run("check-inventory", () => services.checkInventory(items));
    });

    const chargePaymentFlow = flow(
      ecommerceServices,
      async (services, ctx, payment: { orderId: string; amount: number }) => {
        return await ctx.run("charge", () => services.chargePayment(payment.orderId, payment.amount));
      }
    );

    const reserveInventoryFlow = flow(ecommerceServices, async (services, ctx, items: string[]) => {
      return await ctx.run("reserve", () => services.reserveInventory(items));
    });

    const processOrderFlow = flow(ecommerceServices, async (services, ctx, order: Order) => {
      const validation = await ctx.exec(validateOrderFlow, order);
      const inventory = await ctx.exec(checkInventoryFlow, order.items);

      const settled = await ctx.parallelSettled([
        ctx.exec(chargePaymentFlow, { orderId: order.orderId, amount: order.total }),
        ctx.exec(reserveInventoryFlow, order.items),
      ]);

      const [paymentResult, inventoryResult] = settled.results;

      if (paymentResult.status === "rejected") {
        throw new Error(`Payment failed: ${(paymentResult.reason as Error).message}`);
      }
      if (inventoryResult.status === "rejected") {
        throw new Error(`Inventory failed: ${(inventoryResult.reason as Error).message}`);
      }

      const statusUpdate = await ctx.run("update-status", () =>
        services.updateOrderStatus(order.orderId, "completed")
      );

      return {
        orderId: order.orderId,
        validation,
        inventory,
        payment: paymentResult.value,
        inventoryReservation: inventoryResult.value,
        status: statusUpdate,
      };
    });

    const validOrder: Order = {
      orderId: "order-123",
      items: ["item1", "item2"],
      total: 100,
    };

    const successResult = await flow.execute(processOrderFlow, validOrder);

    expect(successResult.orderId).toBe("order-123");
    expect((successResult.validation as { valid: boolean }).valid).toBe(true);
    expect((successResult.status as { status: string }).status).toBe("completed");

    await expect(
      flow.execute(processOrderFlow, { orderId: "order-456", items: [], total: 50 })
    ).rejects.toThrow("Order has no items");

    await expect(
      flow.execute(processOrderFlow, {
        orderId: "order-789",
        items: ["item1", "out-of-stock"],
        total: 75,
      })
    ).rejects.toThrow("Items unavailable");
  });
});
