import { flow } from "@pumped-fn/core-next";
import { custom } from "@pumped-fn/core-next/ssch";
import { executes } from "@pumped-fn/core-next";

const {
  safeAsync,
  Service,
  parallel,
  chain,
  combine
} = executes;

type Result<T, E = unknown> = executes.Result<T, E>;

// =============================================================================
// Service definitions that can throw
// =============================================================================

const paymentGateway = {
  async charge(amount: number, cardToken: string) {
    if (amount <= 0) throw new Error("Amount must be positive");
    if (!cardToken.startsWith("tok_")) throw new Error("Invalid card token");
    if (Math.random() < 0.1) throw new Error("Payment gateway timeout");

    return {
      transactionId: `txn_${Date.now()}`,
      amount,
      status: "completed" as const
    };
  },

  async refund(transactionId: string, amount: number) {
    if (!transactionId.startsWith("txn_")) throw new Error("Invalid transaction ID");
    if (amount <= 0) throw new Error("Refund amount must be positive");

    return {
      refundId: `ref_${Date.now()}`,
      transactionId,
      amount,
      status: "refunded" as const
    };
  }
};

const inventorySystem = {
  async reserveItems(items: Array<{ productId: string; quantity: number }>) {
    for (const item of items) {
      if (item.quantity <= 0) throw new Error(`Invalid quantity for ${item.productId}`);
      if (item.productId === "out_of_stock") throw new Error("Item out of stock");
    }

    return {
      reservationId: `res_${Date.now()}`,
      items: items.map(item => ({ ...item, reserved: true })),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    };
  },

  async confirmReservation(reservationId: string) {
    if (!reservationId.startsWith("res_")) throw new Error("Invalid reservation ID");

    return {
      confirmed: true,
      reservationId,
      confirmedAt: new Date().toISOString()
    };
  }
};

// =============================================================================
// Safe wrapped services - no more exceptions!
// =============================================================================

const safePayment = Service.wrapAsync(paymentGateway);
const safeInventory = Service.wrapAsync(inventorySystem);

// =============================================================================
// Flow definitions
// =============================================================================

const processOrderFlow = flow.define({
  name: "process-order-with-helpers",
  input: custom<{
    items: Array<{ productId: string; quantity: number; price: number }>;
    payment: { cardToken: string };
    customerId: string;
  }>(),
  success: custom<{
    orderId: string;
    transactionId: string;
    reservationId: string;
    total: number;
    status: "completed";
  }>(),
  error: custom<{
    code: string;
    message: string;
    details?: any;
  }>()
});

// =============================================================================
// Method 1: Using helpers directly with ctx.execute
// =============================================================================

const processOrderWithCtxExecute = processOrderFlow.handler(async (ctx, input) => {
  const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Option A: Use safeAsync wrapper with ctx.execute
  const paymentResult = await ctx.execute(
    safeAsync(async (amount: number, token: string) =>
      paymentGateway.charge(amount, token)
    ),
    [total, input.payment.cardToken]
  );

  if (paymentResult.type === "ko") {
    return ctx.ko({
      code: "PAYMENT_FAILED",
      message: "Payment processing failed",
      details: paymentResult.data
    });
  }

  // Nested result handling - extract inner result
  if (paymentResult.data.type === "ko") {
    return ctx.ko({
      code: "PAYMENT_DECLINED",
      message: "Payment was declined",
      details: paymentResult.data.data
    });
  }

  const payment = paymentResult.data.data;

  // Option B: Use wrapped service directly in ctx.execute
  const reservationResult = await ctx.execute(
    async (items: typeof input.items) => safeInventory.reserveItems(items),
    input.items
  );

  if (reservationResult.type === "ko") {
    // Payment succeeded but reservation failed - need to refund
    await ctx.execute(
      async (txnId: string, amount: number) => safePayment.refund(txnId, amount),
      [payment.transactionId, total]
    );

    return ctx.ko({
      code: "INVENTORY_FAILED",
      message: "Could not reserve items, payment refunded",
      details: reservationResult.data
    });
  }

  // Extract the nested result
  if (reservationResult.data.type === "ko") {
    await ctx.execute(
      async (txnId: string, amount: number) => safePayment.refund(txnId, amount),
      [payment.transactionId, total]
    );

    return ctx.ko({
      code: "INVENTORY_UNAVAILABLE",
      message: "Items not available, payment refunded",
      details: reservationResult.data.data
    });
  }

  const reservation = reservationResult.data.data;

  return ctx.ok({
    orderId: `order_${Date.now()}`,
    transactionId: payment.transactionId,
    reservationId: reservation.reservationId,
    total,
    status: "completed" as const
  });
});

// =============================================================================
// Method 2: Using helpers for service composition outside ctx.execute
// =============================================================================

const processOrderWithDirectHelpers = processOrderFlow.handler(async (ctx, input) => {
  const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Use helpers directly for cleaner composition
  const paymentResult = await safePayment.charge(total, input.payment.cardToken);

  if (paymentResult.type === "ko") {
    return ctx.ko({
      code: "PAYMENT_FAILED",
      message: "Payment processing failed",
      details: paymentResult.data
    });
  }

  const payment = paymentResult.data;

  const reservationResult = await safeInventory.reserveItems(input.items);

  if (reservationResult.type === "ko") {
    // Rollback payment
    const refundResult = await safePayment.refund(payment.transactionId, total);

    return ctx.ko({
      code: "INVENTORY_FAILED",
      message: "Could not reserve items, payment refunded",
      details: {
        inventoryError: reservationResult.data,
        refundResult: refundResult.type === "ok" ? "success" : "failed"
      }
    });
  }

  const reservation = reservationResult.data;

  // Confirm reservation
  const confirmResult = await safeInventory.confirmReservation(reservation.reservationId);

  if (confirmResult.type === "ko") {
    // Both payment and reservation need rollback
    await parallel([
      () => safePayment.refund(payment.transactionId, total),
      // In real scenario, would release reservation
    ]);

    return ctx.ko({
      code: "CONFIRMATION_FAILED",
      message: "Could not confirm reservation, payment refunded",
      details: confirmResult.data
    });
  }

  return ctx.ok({
    orderId: `order_${Date.now()}`,
    transactionId: payment.transactionId,
    reservationId: reservation.reservationId,
    total,
    status: "completed" as const
  });
});

// =============================================================================
// Method 3: Hybrid approach - helpers + ctx.execute for complex flows
// =============================================================================

const processOrderHybrid = processOrderFlow.handler(async (ctx, input) => {
  const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Use ctx.executeParallel with safe functions for concurrent operations
  const results = await ctx.executeParallel([
    // Validate payment method (mock)
    [safeAsync(async (token: string) => {
      if (!token.startsWith("tok_")) throw new Error("Invalid token format");
      return { valid: true, token };
    }), input.payment.cardToken],

    // Check inventory availability
    [async (items: typeof input.items) => safeInventory.reserveItems(items), input.items]
  ]);

  const [tokenValidation, inventoryCheck] = results;

  // Combine results to check if both succeeded
  const validationResults = combine([
    tokenValidation.type === "ok" ? tokenValidation.data : tokenValidation,
    inventoryCheck.type === "ok" ? inventoryCheck.data : inventoryCheck
  ]);

  if (validationResults.type === "ko") {
    return ctx.ko({
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      details: validationResults.data
    });
  }

  // Extract the successful validation data
  const [tokenResult, inventoryResult] = validationResults.data;

  // Handle nested results from wrapped services
  if (tokenResult.type === "ko") {
    return ctx.ko({
      code: "INVALID_TOKEN",
      message: "Payment token validation failed",
      details: tokenResult.data
    });
  }

  if (inventoryResult.type === "ko") {
    return ctx.ko({
      code: "INVENTORY_CHECK_FAILED",
      message: "Inventory check failed",
      details: inventoryResult.data
    });
  }

  // Now process payment with validated token
  const paymentResult = await safePayment.charge(total, tokenResult.data.token);

  if (paymentResult.type === "ko") {
    return ctx.ko({
      code: "PAYMENT_FAILED",
      message: "Payment processing failed",
      details: paymentResult.data
    });
  }

  return ctx.ok({
    orderId: `order_${Date.now()}`,
    transactionId: paymentResult.data.transactionId,
    reservationId: inventoryResult.data.reservationId,
    total,
    status: "completed" as const
  });
});

// =============================================================================
// Usage comparison
// =============================================================================

async function demonstrateIntegration() {
  const testOrder = {
    items: [
      { productId: "item1", quantity: 2, price: 29.99 },
      { productId: "item2", quantity: 1, price: 49.99 }
    ],
    payment: { cardToken: "tok_visa_1234" },
    customerId: "cust_123"
  };

  console.log("=== Testing different integration approaches ===\n");

  // Test Method 1: ctx.execute with helpers
  console.log("1. Method 1 - ctx.execute with safeAsync:");
  try {
    const result1 = await flow.execute(processOrderWithCtxExecute, testOrder);
    console.log("Result:", result1.type, result1.data);
  } catch (error) {
    console.log("Error:", error);
  }

  console.log("\n2. Method 2 - Direct helpers:");
  try {
    const result2 = await flow.execute(processOrderWithDirectHelpers, testOrder);
    console.log("Result:", result2.type, result2.data);
  } catch (error) {
    console.log("Error:", error);
  }

  console.log("\n3. Method 3 - Hybrid approach:");
  try {
    const result3 = await flow.execute(processOrderHybrid, testOrder);
    console.log("Result:", result3.type, result3.data);
  } catch (error) {
    console.log("Error:", error);
  }
}

export {
  processOrderWithCtxExecute,
  processOrderWithDirectHelpers,
  processOrderHybrid,
  demonstrateIntegration,
  safePayment,
  safeInventory
};