import { describe, test, expect, vi } from "vitest";
import { flow, provide, extension } from "../src";
import type { Extension } from "../src/types";

describe("Extension Operation Tracking", () => {
  test("journal operations - parameters and outputs", async () => {
    type JournalRecord = {
      key: string;
      params?: readonly unknown[];
      output?: unknown;
    };

    const records: JournalRecord[] = [];
    const journalCapture = extension({
      name: "journal-capture",
      wrap: (_ctx, next, operation) => {
        if (operation.kind === "journal") {
          const record: JournalRecord = {
            key: operation.key,
            params: operation.params,
          };
          return next().then((result) => {
            record.output = result;
            records.push(record);
            return result;
          }).catch((error) => {
            records.push(record);
            throw error;
          });
        }
        return next();
      },
    });

    const mathFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.run("multiply", (a: number, b: number) => a * b, input.x, input.y);
      const sum = await ctx.run("add", (a: number, b: number) => a + b, input.x, input.y);
      const combined = await ctx.run("combine", () => product + sum);
      return { product, sum, combined };
    });

    const result = await flow.execute(mathFlow, { x: 5, y: 3 }, { extensions: [journalCapture] });

    expect(result).toEqual({ product: 15, sum: 8, combined: 23 });
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({ key: "multiply", params: [5, 3], output: 15 });
    expect(records[1]).toEqual({ key: "add", params: [5, 3], output: 8 });
    expect(records[2]).toEqual({ key: "combine", params: undefined, output: 23 });
  });

  test("execution and subflow - input/output tracking", async () => {
    const capturedInputs: Array<{ operation: string; input: unknown }> = [];

    const inputCapture = extension({
      name: "input-capture",
      wrap: (_ctx, next, operation) => {
        if (operation.kind === "execute" || operation.kind === "subflow") {
          capturedInputs.push({
            operation: `${operation.kind}:${operation.definition.name}`,
            input: operation.input,
          });
        }
        return next();
      },
    });

    const addOne = flow((_ctx, x: number) => x + 1);
    const double = flow((_ctx, x: number) => x * 2);
    const composed = flow(async (ctx, input: { value: number }) => {
      const added = await ctx.exec(addOne, input.value);
      const doubled = await ctx.exec(double, added);
      return { original: input.value, result: doubled };
    });

    const result = await flow.execute(composed, { value: 5 }, { extensions: [inputCapture] });

    expect(result).toEqual({ original: 5, result: 12 });
    expect(capturedInputs).toEqual([
      { operation: "execute:anonymous", input: { value: 5 } },
      { operation: "subflow:anonymous", input: 5 },
      { operation: "execute:anonymous", input: 5 },
      { operation: "subflow:anonymous", input: 6 },
      { operation: "execute:anonymous", input: 6 },
    ]);
  });

  test("comprehensive tracking - all operation types with errors", async () => {
    type Record = {
      kind: string;
      flowName?: string;
      journalKey?: string;
      input?: unknown;
      output?: unknown;
      error?: unknown;
      parallelMode?: string;
      promiseCount?: number;
    };

    const records: Record[] = [];
    const tracker = extension({
      name: "tracker",
      wrap: (_ctx, next, operation) => {
        const record: Record = { kind: operation.kind };

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

        return next().then((result) => {
          record.output = result;
          records.push(record);
          return result;
        }).catch((error) => {
          record.error = error;
          records.push(record);
          throw error;
        });
      },
    });

    const api = provide(() => ({
      multiply: vi.fn((x: number) => x * 2),
      add: vi.fn((x: number) => x + 10),
      fail: vi.fn(() => {
        throw new Error("Intentional failure");
      }),
    }));

    const multiplyFlow = flow({ api }, async ({ api }, ctx, input: number) => {
      return await ctx.run("multiply-op", () => api.multiply(input));
    });

    const addFlow = flow({ api }, async ({ api }, ctx, input: number) => {
      return await ctx.run("add-op", () => api.add(input));
    });

    const composedFlow = flow({ api }, async ({ api: _api }, ctx, input: number) => {
      const [multiplied, added] = await ctx.parallel([
        ctx.exec(multiplyFlow, input),
        ctx.exec(addFlow, input),
      ]).then((r) => r.results);

      const combined = await ctx.run("combine", () => multiplied + added);
      return { multiplied, added, combined };
    });

    const result = await flow.execute(composedFlow, 5, { extensions: [tracker] });

    expect(result).toEqual({ multiplied: 10, added: 15, combined: 25 });

    const executeRecords = records.filter((r) => r.kind === "execute");
    expect(executeRecords).toHaveLength(3);
    expect(executeRecords[0].input).toBe(5);

    const parallelRecords = records.filter((r) => r.kind === "parallel");
    expect(parallelRecords).toHaveLength(1);
    expect(parallelRecords[0].parallelMode).toBe("parallel");
    expect(parallelRecords[0].promiseCount).toBe(2);

    const journalRecords = records.filter((r) => r.kind === "journal");
    expect(journalRecords.some((r) => r.journalKey === "multiply-op" && r.output === 10)).toBe(true);
    expect(journalRecords.some((r) => r.journalKey === "add-op" && r.output === 15)).toBe(true);
    expect(journalRecords.some((r) => r.journalKey === "combine" && r.output === 25)).toBe(true);

    records.length = 0;

    const errorFlow = flow({ api }, async ({ api }, ctx, _input: number) => {
      await ctx.run("fail-op", () => api.fail());
    });

    await expect(flow.execute(errorFlow, 1, { extensions: [tracker] })).rejects.toThrow("Intentional failure");

    const errorRecord = records.find((r) => r.kind === "journal");
    expect(errorRecord?.error).toBeDefined();
    expect((errorRecord?.error as Error).message).toBe("Intentional failure");
  });

  test("real-world example - e-commerce order processing with error scenarios", async () => {
    type Order = { orderId: string; items: string[]; total: number };

    const services = provide(() => ({
      validateOrder: vi.fn((order: Order) => {
        if (order.items.length === 0) throw new Error("Order has no items");
        return { valid: true, orderId: order.orderId };
      }),
      checkInventory: vi.fn((items: string[]) => {
        const unavailable = items.filter((item) => item === "out-of-stock");
        if (unavailable.length > 0)
          throw new Error(`Items unavailable: ${unavailable.join(", ")}`);
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

    const validateOrderFlow = flow(services, async (svc, ctx, order: Order) => {
      return await ctx.run("validate", () => svc.validateOrder(order));
    });

    const checkInventoryFlow = flow(services, async (svc, ctx, items: string[]) => {
      return await ctx.run("check-inventory", () => svc.checkInventory(items));
    });

    const chargePaymentFlow = flow(
      services,
      async (svc, ctx, payment: { orderId: string; amount: number }) => {
        return await ctx.run("charge", () =>
          svc.chargePayment(payment.orderId, payment.amount)
        );
      }
    );

    const reserveInventoryFlow = flow(services, async (svc, ctx, items: string[]) => {
      return await ctx.run("reserve", () => svc.reserveInventory(items));
    });

    const processOrderFlow = flow(services, async (svc, ctx, order: Order) => {
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
        svc.updateOrderStatus(order.orderId, "completed")
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

    const successOrder: Order = {
      orderId: "order-123",
      items: ["item1", "item2"],
      total: 100,
    };

    const result = await flow.execute(processOrderFlow, successOrder);

    expect(result.orderId).toBe("order-123");
    expect((result.validation as { valid: boolean }).valid).toBe(true);
    expect((result.status as { status: string }).status).toBe("completed");

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
