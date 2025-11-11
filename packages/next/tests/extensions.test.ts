import { describe, test, expect, vi } from "vitest";
import { flow, provide } from "../src";
import { createTrackingExtension } from "./utils";

describe("Extension Operation Tracking", () => {
  test("extension captures journal operations with parameters and outputs", async () => {
    const { ext, records } = createTrackingExtension((kind, op) =>
      kind === "execution" && op.kind === "execution" && op.target.type === "fn" && op.key !== undefined
    );

    const mathCalculationFlow = flow(async (ctx, input: { x: number; y: number }) => {
      const product = await ctx.exec({ key: "multiply", fn: (a: number, b: number) => a * b, params: [input.x, input.y] });
      const sum = await ctx.exec({ key: "add", fn: (a: number, b: number) => a + b, params: [input.x, input.y] });
      const combined = await ctx.exec({ key: "combine", fn: () => product + sum });

      return { product, sum, combined };
    });

    const result = await flow.execute(
      mathCalculationFlow,
      { x: 5, y: 3 },
      { extensions: [ext] }
    );

    expect(result).toEqual({ product: 15, sum: 8, combined: 23 });
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ key: "multiply", params: [5, 3], output: 15 });
    expect(records[1]).toMatchObject({ key: "add", params: [5, 3], output: 8 });
    expect(records[2]).toMatchObject({ key: "combine", output: 23 });
  });

  test("extension intercepts flow execution and subflow inputs", async () => {
    const { ext, records } = createTrackingExtension((kind, op) =>
      kind === "execution" && op.kind === "execution" && op.target.type === "flow"
    );

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
      { extensions: [ext] }
    );

    expect(result).toEqual({ original: 5, result: 12 });
    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => r.input === 5)).toBe(true);
    expect(records.some(r => r.input === 6)).toBe(true);
  });

  test("extension tracks all operation kinds including parallel execution and errors", async () => {
    const { ext, records } = createTrackingExtension();

    const mockApi = provide(() => ({
      multiply: vi.fn((x: number) => x * 2),
      add: vi.fn((x: number) => x + 10),
      fail: vi.fn(() => {
        throw new Error("Intentional failure");
      }),
    }));

    const multiplyFlow = flow({ api: mockApi }, async ({ api }, ctx, input: number) => {
      return await ctx.exec({ key: "multiply-op", fn: () => api.multiply(input) });
    });

    const addFlow = flow({ api: mockApi }, async ({ api }, ctx, input: number) => {
      return await ctx.exec({ key: "add-op", fn: () => api.add(input) });
    });

    const parallelComputationFlow = flow({ api: mockApi }, async ({ api: _api }, ctx, input: number) => {
      const [multiplied, added] = await ctx
        .parallel([ctx.exec(multiplyFlow, input), ctx.exec(addFlow, input)])
        .then((r) => r.results);

      const combined = await ctx.exec({ key: "combine", fn: () => multiplied + added });

      return { multiplied, added, combined };
    });

    const result = await flow.execute(parallelComputationFlow, 5, { extensions: [ext] });

    expect(result).toEqual({ multiplied: 10, added: 15, combined: 25 });

    const executeOperations = records.filter((r) => r.kind === "execution" && r.targetType === "flow");
    expect(executeOperations.length).toBeGreaterThanOrEqual(3);
    expect(executeOperations[0].input).toBe(5);

    const parallelOperations = records.filter((r) => r.kind === "execution" && r.targetType === "parallel");
    expect(parallelOperations).toHaveLength(1);
    expect(parallelOperations[0].parallelMode).toBe("parallel");
    expect(parallelOperations[0].count).toBe(2);

    const journalOperations = records.filter((r) => r.kind === "execution" && r.targetType === "fn" && r.key);
    expect(journalOperations.some((r) => r.key === "multiply-op" && r.output === 10)).toBe(true);
    expect(journalOperations.some((r) => r.key === "add-op" && r.output === 15)).toBe(true);
    expect(journalOperations.some((r) => r.key === "combine" && r.output === 25)).toBe(true);

    records.length = 0;

    const failingFlow = flow({ api: mockApi }, async ({ api }, ctx, _input: number) => {
      await ctx.exec({ key: "fail-op", fn: () => api.fail() });
    });

    await expect(flow.execute(failingFlow, 1, { extensions: [ext] })).rejects.toThrow(
      "Intentional failure"
    );

    const errorOperation = records.find((r) => r.kind === "execution" && r.targetType === "fn");
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
      return await ctx.exec({ key: "validate", fn: () => services.validateOrder(order) });
    });

    const checkInventoryFlow = flow(ecommerceServices, async (services, ctx, items: string[]) => {
      return await ctx.exec({ key: "check-inventory", fn: () => services.checkInventory(items) });
    });

    const chargePaymentFlow = flow(
      ecommerceServices,
      async (services, ctx, payment: { orderId: string; amount: number }) => {
        return await ctx.exec({ key: "charge", fn: () => services.chargePayment(payment.orderId, payment.amount) });
      }
    );

    const reserveInventoryFlow = flow(ecommerceServices, async (services, ctx, items: string[]) => {
      return await ctx.exec({ key: "reserve", fn: () => services.reserveInventory(items) });
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

      const statusUpdate = await ctx.exec({ key: "update-status", fn: () =>
        services.updateOrderStatus(order.orderId, "completed") });

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
