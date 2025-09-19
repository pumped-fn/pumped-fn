import { flow, custom } from "@pumped-fn/core-next";
import { db, payment, shipping, notification, logger } from "./services.js";

namespace Types {
  export type OrderInput = {
    items: Array<{ productId: string; quantity: number }>;
    customerId: string;
    payment: { method: "card" | "paypal"; token: string };
    shipping: { address: string; city: string; zip: string };
  };

  export type OrderSuccess = {
    orderId: string;
    total: number;
    estimatedDelivery: Date;
    trackingNumber: string;
  };

  export type OrderError = {
    code: "INVENTORY" | "PAYMENT" | "VALIDATION" | "SYSTEM";
    message: string;
    details?: unknown;
  };

  export type ValidationInput = {
    items: Array<{ productId: string; quantity: number }>;
    customerId: string;
    shipping: { address: string; city: string; zip: string };
  };

  export type ValidationSuccess = {
    total: number;
    customerValid: boolean;
    addressValid: boolean;
    itemsValid: boolean;
  };

  export type PaymentInput = {
    payment: { method: "card" | "paypal"; token: string };
    total: number;
    customerId: string;
  };

  export type PaymentSuccess = {
    transactionId: string;
    charged: number;
  };

  export type InventoryInput = {
    items: Array<{ productId: string; quantity: number }>;
    orderId: string;
  };

  export type InventorySuccess = {
    reserved: boolean;
    restockTriggered: string[];
  };

  export type NotificationInput = {
    orderId: string;
    customerId: string;
    trackingNumber: string;
    total: number;
  };

  export type NotificationSuccess = {
    emailSent: boolean;
    smsSent: boolean;
    webhookSent: boolean;
  };

  export type GenericError = {
    code: string;
    message: string;
    details?: unknown;
  };
}

const processOrderSpec = flow.define({
  name: "order.process",
  input: custom<Types.OrderInput>(),
  success: custom<Types.OrderSuccess>(),
  error: custom<Types.OrderError>(),
});

const validateOrderSpec = flow.define({
  name: "order.validate",
  input: custom<Types.ValidationInput>(),
  success: custom<Types.ValidationSuccess>(),
  error: custom<Types.GenericError>(),
});

const validateOrderFlow = validateOrderSpec.handler(
  { db, shipping },
  async ({ db, shipping }, ctx, input) => {
    const customerResult = await ctx.execute(
      async (customerId: string) => db.validateCustomer(customerId),
      input.customerId
    );

    if (customerResult.type === "ko") {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: "Customer validation service failed",
      });
    }

    if (!customerResult.data) {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: "Customer account is invalid",
      });
    }

    const addressResult = await ctx.execute(
      async (address: typeof input.shipping) => shipping.validateAddress(address),
      input.shipping
    );

    if (addressResult.type === "ko") {
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: "Address validation service failed",
      });
    }

    if (!addressResult.data) {
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: "Shipping address is invalid",
      });
    }

    const inventoryResult = await ctx.execute(
      async (items: typeof input.items) => db.checkInventory(items),
      input.items
    );

    if (inventoryResult.type === "ko") {
      return ctx.ko({
        code: "INSUFFICIENT_INVENTORY",
        message: "Inventory check service failed",
      });
    }

    if (!inventoryResult.data.available) {
      return ctx.ko({
        code: "INSUFFICIENT_INVENTORY",
        message: "Items not available",
        details: inventoryResult.data.unavailable,
      });
    }

    const total = inventoryResult.data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    return ctx.ok({
      total,
      customerValid: true,
      addressValid: true,
      itemsValid: true,
    });
  }
);
flow(
  {
    name: "payment.process",
    input: custom<Types.PaymentInput>(),
    success: custom<Types.PaymentSuccess>(),
    error: custom<Types.GenericError>(),
  },
  (ctx) => {
    return ctx.ok({ transactionId: "tx_123", charged: 100 });
  }
);

const processPaymentSpec = flow.define({
  name: "payment.process",
  input: custom<Types.PaymentInput>(),
  success: custom<Types.PaymentSuccess>(),
  error: custom<Types.GenericError>(),
});

const processPaymentFlow = processPaymentSpec.handler(
  { payment },
  async ({ payment }, ctx, input) => {
    const result = await payment.charge({
      method: input.payment.method,
      token: input.payment.token,
      amount: input.total,
      customerId: input.customerId,
    });

    if (!result.success) {
      return ctx.ko({
        code: "PAYMENT_DECLINED",
        message: "Payment processing failed",
        details: result.error,
      });
    }

    return ctx.ok({
      transactionId: result.transactionId,
      charged: result.amount,
    });
  }
);

const updateInventorySpec = flow.define({
  name: "inventory.update",
  input: custom<Types.InventoryInput>(),
  success: custom<Types.InventorySuccess>(),
  error: custom<Types.GenericError>(),
});

const updateInventoryFlow = updateInventorySpec.handler(
  { db },
  async ({ db }, ctx, input) => {
    const reserveResult = await db.reserveItems(input.items, input.orderId);
    if (!reserveResult.success) {
      return ctx.ko({
        code: "RESERVATION_FAILED",
        message: "Failed to reserve items",
        details: reserveResult.errors,
      });
    }

    const restockTriggered = await db.checkRestockThresholds(input.items);

    return ctx.ok({
      reserved: true,
      restockTriggered,
    });
  }
);

const sendNotificationsSpec = flow.define({
  name: "notifications.send",
  input: custom<Types.NotificationInput>(),
  success: custom<Types.NotificationSuccess>(),
  error: custom<Types.GenericError>(),
});

const sendNotificationsFlow = sendNotificationsSpec.handler(
  { notification },
  async ({ notification }, ctx, input) => {
    const emailFlow = flow(
      flow.define({
        name: "notification.email",
        input: custom<{ orderId: string; customerId: string }>(),
        success: custom<{ sent: boolean }>(),
        error: custom<{ error: string }>(),
      }),
      async (ctx, emailInput) => {
        const sent = await notification.sendEmail(
          emailInput.customerId,
          `Order ${emailInput.orderId} confirmed`
        );
        return ctx.ok({ sent });
      }
    );

    const smsFlow = flow(
      {
        name: "notification.sms",
        input: custom<{ customerId: string; trackingNumber: string }>(),
        success: custom<{ sent: boolean }>(),
        error: custom<{ error: string }>(),
      },
      async (ctx, smsInput) => {
        const sent = await notification.sendSMS(
          smsInput.customerId,
          `Tracking: ${smsInput.trackingNumber}`
        );
        return ctx.ok({ sent });
      }
    );

    const webhookFlow = flow(
      {
        name: "notification.webhook",
        input: custom<{ orderId: string; total: number }>(),
        success: custom<{ sent: boolean }>(),
        error: custom<{ error: string }>(),
      },
      async (ctx, webhookInput) => {
        const sent = await notification.sendWebhook({
          orderId: webhookInput.orderId,
          total: webhookInput.total,
        });
        return ctx.ok({ sent });
      }
    );

    const [emailResult, smsResult, webhookResult] = await ctx.executeParallel([
      [emailFlow, { orderId: input.orderId, customerId: input.customerId }],
      [
        smsFlow,
        { customerId: input.customerId, trackingNumber: input.trackingNumber },
      ],
      [webhookFlow, { orderId: input.orderId, total: input.total }],
    ]);

    return ctx.ok({
      emailSent: emailResult.type === "ok" ? emailResult.data.sent : false,
      smsSent: smsResult.type === "ok" ? smsResult.data.sent : false,
      webhookSent:
        webhookResult.type === "ok" ? webhookResult.data.sent : false,
    });
  }
);

const processOrder = processOrderSpec.handler(
  { db, payment, notification, shipping, logger },
  async ({ db, logger }, ctx, input) => {
    const orderId = await db.createOrder(input);
    ctx.set("orderId", orderId);
    ctx.set("customerId", input.customerId);

    logger.info("Processing order", { orderId, customerId: input.customerId });

    const validation = await ctx.execute(validateOrderFlow, {
      items: input.items,
      customerId: input.customerId,
      shipping: input.shipping,
    });

    if (validation.type === "ko") {
      await db.markOrderFailed(orderId, validation.data.message);
      return ctx.ko({
        code: "VALIDATION",
        message: validation.data.message,
        details: validation.data.details,
      });
    }

    const payment = await ctx.execute(processPaymentFlow, {
      payment: input.payment,
      total: validation.data.total,
      customerId: input.customerId,
    });

    if (payment.type === "ko") {
      await db.markOrderFailed(orderId, payment.data.message);
      return ctx.ko({
        code: "PAYMENT",
        message: payment.data.message,
        details: payment.data.details,
      });
    }

    const inventory = await ctx.execute(updateInventoryFlow, {
      items: input.items,
      orderId,
    });

    if (inventory.type === "ko") {
      await db.markOrderFailed(orderId, inventory.data.message);
      return ctx.ko({
        code: "INVENTORY",
        message: inventory.data.message,
        details: inventory.data.details,
      });
    }

    const shippingResult = await ctx.executeParallel([
      [async (orderId: string) => db.generateTrackingNumber(orderId), orderId],
      [async (shipping: typeof input.shipping) => db.calculateDelivery(shipping), input.shipping]
    ]);

    if (shippingResult[0].type === "ko" || shippingResult[1].type === "ko") {
      return ctx.ko({
        code: "SHIPPING_ERROR",
        message: "Failed to generate shipping information",
      });
    }

    const trackingNumber = shippingResult[0].data;
    const estimatedDelivery = shippingResult[1].data;

    const completionResult = await ctx.execute(
      async (orderId: string, details: any) => db.markOrderCompleted(orderId, details),
      [orderId, {
        transactionId: payment.data.transactionId,
        trackingNumber,
        estimatedDelivery,
      }]
    );

    if (completionResult.type === "ko") {
      logger.error("Failed to mark order as completed", completionResult.data);
    }

    const notifications = await ctx.execute(sendNotificationsFlow, {
      orderId,
      customerId: input.customerId,
      trackingNumber,
      total: validation.data.total,
    });

    if (notifications.type === "ko") {
      logger.warn("Notifications failed but order completed", {
        orderId,
        error: notifications.data,
      });
    }

    return ctx.ok({
      orderId,
      total: validation.data.total,
      estimatedDelivery,
      trackingNumber,
    });
  }
);

export { processOrder };
