import { provide, createScope, name, flow, custom } from "@pumped-fn/core-next";

namespace Order {
  export type Input = {
    items: Array<{ productId: string; quantity: number }>;
    customerId: string;
    payment: { method: "card" | "paypal"; token: string };
    shipping: { address: string; city: string; zip: string };
  };

  export type Success = {
    orderId: string;
    total: number;
    estimatedDelivery: Date;
    trackingNumber: string;
  };

  export type Error = {
    code: "INVENTORY" | "PAYMENT" | "VALIDATION" | "SYSTEM";
    message: string;
    details?: unknown;
  };
}

namespace Validation {
  export type Input = Order.Input;
  export type Success = {
    total: number;
    validatedItems: Array<{ productId: string; quantity: number; price: number }>;
  };
  export type Error = { field: string; message: string };
}

namespace Payment {
  export type Input = { amount: number; method: string; token: string };
  export type Success = { transactionId: string };
  export type Error = { code: string; message: string };
}

namespace Inventory {
  export type Input = { items: Array<{ productId: string; quantity: number }> };
  export type Success = { reserved: boolean };
  export type Error = { productId: string; available: number; requested: number };
}

namespace Notification {
  export type Input = { orderId: string; customerId: string; total: number };
  export type Success = { sent: boolean; channel: string };
  export type Error = { channel: string; message: string };
}

const validateOrderFlow = flow.define({
  name: "order.validate",
  input: custom<Validation.Input>(),
  success: custom<Validation.Success>(),
  error: custom<Validation.Error>(),
});

const processPaymentFlow = flow.define({
  name: "payment.process",
  input: custom<Payment.Input>(),
  success: custom<Payment.Success>(),
  error: custom<Payment.Error>(),
});

const updateInventoryFlow = flow.define({
  name: "inventory.update",
  input: custom<Inventory.Input>(),
  success: custom<Inventory.Success>(),
  error: custom<Inventory.Error>(),
});

const sendEmailFlow = flow.define({
  name: "notification.email",
  input: custom<Notification.Input>(),
  success: custom<Notification.Success>(),
  error: custom<Notification.Error>(),
});

const sendSmsFlow = flow.define({
  name: "notification.sms",
  input: custom<Notification.Input>(),
  success: custom<Notification.Success>(),
  error: custom<Notification.Error>(),
});

const notifyFulfillmentFlow = flow.define({
  name: "notification.fulfillment",
  input: custom<Notification.Input>(),
  success: custom<Notification.Success>(),
  error: custom<Notification.Error>(),
});

const processOrderFlow = flow.define({
  name: "order.process",
  input: custom<Order.Input>(),
  success: custom<Order.Success>(),
  error: custom<Order.Error>(),
});

const db = provide(() => ({
  findProduct: (id: string) => ({ id, price: 29.99, stock: 100 }),
  createOrder: () => `order_${Date.now()}`,
  updateStock: (id: string, quantity: number) => true,
}), name("db"));

const payment = provide(() => ({
  charge: (amount: number, method: string, token: string) => ({
    success: true,
    transactionId: `txn_${Date.now()}`
  }),
}), name("payment"));

const notification = provide(() => ({
  sendEmail: (orderId: string, customerId: string) => ({ sent: true }),
  sendSms: (orderId: string, customerId: string) => ({ sent: true }),
  notifyFulfillment: (orderId: string) => ({ sent: true }),
}), name("notification"));

const shipping = provide(() => ({
  validateAddress: (address: any) => ({ valid: true }),
  calculateDelivery: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  generateTrackingNumber: () => `TRK${Date.now()}`,
}), name("shipping"));

const logger = provide(() => ({
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ""),
  error: (msg: string, data?: any) => console.log(`[ERROR] ${msg}`, data || ""),
}), name("logger"));

const validateOrder = flow(
  validateOrderFlow,
  { db, shipping },
  async ({ db, shipping }, ctx, input) => {
    const addressResult = await ctx.execute(
      async (address: typeof input.shipping) => shipping.validateAddress(address),
      input.shipping
    );

    if (addressResult.type === "ko") {
      return ctx.ko({ field: "shipping", message: "Address validation service failed" });
    }

    if (!addressResult.data.valid) {
      return ctx.ko({ field: "shipping", message: "Invalid shipping address" });
    }

    for (const item of input.items) {
      const productResult = await ctx.execute(
        async (productId: string) => db.findProduct(productId),
        item.productId
      );

      if (productResult.type === "ko") {
        return ctx.ko({ field: "items", message: `Product lookup failed for ${item.productId}` });
      }

      if (!productResult.data) {
        return ctx.ko({ field: "items", message: `Product ${item.productId} not found` });
      }
      if (productResult.data.stock < item.quantity) {
        return ctx.ko({ field: "items", message: `Insufficient stock for ${item.productId}` });
      }
    }

    const validatedItems = [];
    for (const item of input.items) {
      const productResult = await ctx.execute(
        async (productId: string) => db.findProduct(productId),
        item.productId
      );

      if (productResult.type === "ok") {
        validatedItems.push({ ...item, price: productResult.data.price });
      }
    }

    const total = validatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    return ctx.ok({ total, validatedItems });
  }
);

const processPayment = flow(
  processPaymentFlow,
  { payment },
  async ({ payment }, ctx, input) => {
    const paymentResult = await ctx.execute(
      async (amount: number, method: string, token: string) =>
        payment.charge(amount, method, token),
      [input.amount, input.method, input.token]
    );

    if (paymentResult.type === "ko") {
      return ctx.ko({ code: "SERVICE_ERROR", message: "Payment service failed" });
    }

    const result = paymentResult.data;
    if (!result.success) {
      return ctx.ko({ code: "DECLINED", message: "Payment was declined" });
    }

    return ctx.ok({ transactionId: result.transactionId });
  }
);

const updateInventory = flow(
  updateInventoryFlow,
  { db },
  async ({ db }, ctx, input) => {
    for (const item of input.items) {
      const stockResult = await ctx.execute(
        async (productId: string, quantity: number) => db.updateStock(productId, quantity),
        [item.productId, item.quantity]
      );

      if (stockResult.type === "ko") {
        return ctx.ko({
          productId: item.productId,
          available: 0,
          requested: item.quantity
        });
      }

      if (!stockResult.data) {
        return ctx.ko({
          productId: item.productId,
          available: 0,
          requested: item.quantity
        });
      }
    }

    return ctx.ok({ reserved: true });
  }
);

const sendEmail = flow(
  sendEmailFlow,
  { notification },
  async ({ notification }, ctx, input) => {
    const emailResult = await ctx.execute(
      async (orderId: string, customerId: string) => notification.sendEmail(orderId, customerId),
      [input.orderId, input.customerId]
    );

    if (emailResult.type === "ko") {
      return ctx.ko({ channel: "email", message: "Email service failed" });
    }

    return ctx.ok({ sent: emailResult.data.sent, channel: "email" });
  }
);

const sendSms = flow(
  sendSmsFlow,
  { notification },
  async ({ notification }, ctx, input) => {
    const smsResult = await ctx.execute(
      async (orderId: string, customerId: string) => notification.sendSms(orderId, customerId),
      [input.orderId, input.customerId]
    );

    if (smsResult.type === "ko") {
      return ctx.ko({ channel: "sms", message: "SMS service failed" });
    }

    return ctx.ok({ sent: smsResult.data.sent, channel: "sms" });
  }
);

const notifyFulfillment = flow(
  notifyFulfillmentFlow,
  { notification },
  async ({ notification }, ctx, input) => {
    const fulfillmentResult = await ctx.execute(
      async (orderId: string) => notification.notifyFulfillment(orderId),
      input.orderId
    );

    if (fulfillmentResult.type === "ko") {
      return ctx.ko({ channel: "fulfillment", message: "Fulfillment service failed" });
    }

    return ctx.ok({ sent: fulfillmentResult.data.sent, channel: "fulfillment" });
  }
);

const processOrder = flow(
  processOrderFlow,
  { db, shipping, logger },
  async ({ db, shipping, logger }, ctx, input) => {
    const orderResult = await ctx.execute(
      async () => db.createOrder(),
      undefined
    );

    if (orderResult.type === "ko") {
      return ctx.ko({
        code: "SYSTEM",
        message: "Failed to create order",
        details: orderResult.data,
      });
    }

    const orderId = orderResult.data;
    ctx.set("orderId", orderId);
    ctx.set("traceId", `trace_${Date.now()}`);
    ctx.set("customerId", input.customerId);

    const validation = await ctx.execute(validateOrder, input);
    if (validation.type === "ko") {
      return ctx.ko({
        code: "VALIDATION",
        message: "Order validation failed",
        details: validation.data,
      });
    }

    const paymentResult = await ctx.execute(processPayment, {
      amount: validation.data.total,
      method: input.payment.method,
      token: input.payment.token,
    });

    if (paymentResult.type === "ko") {
      return ctx.ko({
        code: "PAYMENT",
        message: "Payment processing failed",
        details: paymentResult.data,
      });
    }

    const inventoryResult = await ctx.execute(updateInventory, {
      items: input.items,
    });

    if (inventoryResult.type === "ko") {
      return ctx.ko({
        code: "INVENTORY",
        message: "Inventory update failed",
        details: inventoryResult.data,
      });
    }

    const notificationInput = {
      orderId,
      customerId: input.customerId,
      total: validation.data.total,
    };

    const notificationResults = await ctx.executeParallel([
      [sendEmail, notificationInput],
      [sendSms, notificationInput],
      [notifyFulfillment, notificationInput],
    ]);

    // Log notification failures but don't fail the order
    notificationResults.forEach((result, index) => {
      const channels = ["email", "sms", "fulfillment"];
      if (result.type === "ko") {
        logger.error(`${channels[index]} notification failed`, result.data);
      }
    });

    const shippingResult = await ctx.executeParallel([
      [async () => shipping.calculateDelivery(), undefined],
      [async () => shipping.generateTrackingNumber(), undefined]
    ]);

    if (shippingResult[0].type === "ko" || shippingResult[1].type === "ko") {
      return ctx.ko({
        code: "SYSTEM",
        message: "Shipping service failed",
        details: { delivery: shippingResult[0], tracking: shippingResult[1] },
      });
    }

    return ctx.ok({
      orderId,
      total: validation.data.total,
      estimatedDelivery: shippingResult[0].data,
      trackingNumber: shippingResult[1].data,
    });
  }
);

async function main() {
  const scope = createScope();

  try {
    const testOrder: Order.Input = {
      items: [
        { productId: "prod_123", quantity: 2 },
        { productId: "prod_456", quantity: 1 },
      ],
      customerId: "cust_789",
      payment: { method: "card", token: "tok_abc123" },
      shipping: {
        address: "123 Main St",
        city: "Anytown",
        zip: "12345",
      },
    };

    const result = await flow.execute(processOrder, testOrder, { scope });

    if (result.type === "ok") {
      console.log("Order processed successfully:", result.data);
    } else {
      console.log("Order failed:", result.data);
    }
  } finally {
    await scope.dispose();
  }
}

main().catch(console.error);