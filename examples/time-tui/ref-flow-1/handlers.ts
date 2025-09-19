import { db, payment, notification, shipping, logger } from "./dependencies";
import {
  validateOrderFlow,
  processPaymentFlow,
  updateInventoryFlow,
  sendNotificationsFlow,
  processOrderFlow
} from "./flows";

export const validateOrder = validateOrderFlow.handler(
  { db, shipping, logger },
  async ({ db, shipping, logger }, ctx, input) => {
    logger.info("Starting order validation", { customerId: input.customerId });

    const customerResult = await ctx.execute(
      async (customerId: string) => db.findCustomer(customerId),
      input.customerId
    );

    if (customerResult.type === "ko") {
      logger.error("Customer lookup failed", customerResult.data);
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: "Failed to lookup customer",
        details: customerResult.data,
      });
    }

    if (!customerResult.data) {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: `Customer ${input.customerId} not found`,
      });
    }

    if (customerResult.data.status === "suspended") {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: "Customer account is suspended",
      });
    }

    const addressResult = await ctx.execute(
      async (address: typeof input.shipping) => shipping.validateAddress(address),
      input.shipping
    );

    if (addressResult.type === "ko") {
      logger.error("Address validation failed", addressResult.data);
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: "Address validation service failed",
        details: addressResult.data,
      });
    }

    if (!addressResult.data.valid) {
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: addressResult.data.error || "Invalid shipping address",
      });
    }

    const availableItems = [];
    let totalWithTax = 0;

    for (const item of input.items) {
      const inventoryResult = await ctx.execute(
        async (productId: string) => db.checkInventory(productId),
        item.productId
      );

      if (inventoryResult.type === "ko") {
        logger.error("Inventory check failed", { productId: item.productId, error: inventoryResult.data });
        return ctx.ko({
          code: "INSUFFICIENT_INVENTORY",
          message: `Failed to check inventory for product ${item.productId}`,
          details: inventoryResult.data,
        });
      }

      const inventory = inventoryResult.data;
      if (inventory.available < item.quantity) {
        return ctx.ko({
          code: "INSUFFICIENT_INVENTORY",
          message: `Insufficient inventory for product ${item.productId}`,
          details: { requested: item.quantity, available: inventory.available },
        });
      }
      availableItems.push({ productId: item.productId, available: inventory.available });
      totalWithTax += inventory.price * item.quantity;
    }

    totalWithTax *= 1.08;

    logger.info("Order validation completed", { totalWithTax, itemCount: input.items.length });

    return ctx.ok({
      validated: true,
      totalWithTax,
      availableItems,
    });
  }
);

export const processPayment = processPaymentFlow.handler(
  { payment, logger },
  async ({ payment, logger }, ctx, input) => {
    logger.info("Processing payment", { amount: input.amount, method: input.method });

    const paymentResult = await ctx.execute(
      async (paymentData: { amount: number; method: string; token: string }) =>
        payment.processPayment(paymentData),
      {
        amount: input.amount,
        method: input.method,
        token: input.token,
      }
    );

    if (paymentResult.type === "ko") {
      logger.error("Payment service failed", paymentResult.data);
      return ctx.ko({
        code: "PAYMENT_DECLINED",
        message: paymentResult.data instanceof Error ? paymentResult.data.message : "Payment service error",
      });
    }

    const result = paymentResult.data;
    if ("error" in result) {
      logger.error("Payment failed", result);
      return ctx.ko({
        code: result.declineCode === "INSUFFICIENT_FUNDS" ? "INSUFFICIENT_FUNDS" : "PAYMENT_DECLINED",
        message: result.error,
        declineCode: result.declineCode,
      });
    }

    logger.info("Payment completed", { transactionId: result.transactionId });

    return ctx.ok({
      transactionId: result.transactionId,
      amount: input.amount,
      status: "completed" as const,
    });
  }
);

export const updateInventory = updateInventoryFlow.handler(
  { db, logger },
  async ({ db, logger }, ctx, input) => {
    logger.info("Updating inventory", { orderId: input.orderId, itemCount: input.items.length });

    const reservationResult = await ctx.execute(
      async (items: typeof input.items) => db.reserveItems(items),
      input.items
    );

    if (reservationResult.type === "ko") {
      logger.error("Inventory reservation service failed", reservationResult.data);
      return ctx.ko({
        code: "RESERVATION_FAILED",
        message: reservationResult.data instanceof Error ? reservationResult.data.message : "Inventory service error",
      });
    }

    if (!reservationResult.data) {
      return ctx.ko({
        code: "RESERVATION_FAILED",
        message: "Failed to reserve inventory items",
        failedItems: input.items.map(item => ({
          productId: item.productId,
          requested: item.quantity,
          available: 0,
        })),
      });
    }

    const updatedStock = input.items.map(item => ({
      productId: item.productId,
      newStock: Math.max(0, 10 - item.quantity),
    }));

    logger.info("Inventory updated successfully", { orderId: input.orderId });

    return ctx.ok({
      reserved: true,
      updatedStock,
    });
  }
);

export const sendNotifications = sendNotificationsFlow.handler(
  { notification, logger },
  async ({ notification, logger }, ctx, input) => {
    logger.info("Sending notifications", { orderId: input.orderId, customerId: input.customerId });

    const [emailResult, smsResult, webhookResult] = await ctx.executeParallel([
      [async (customerId: string) => notification.sendEmail(customerId), input.customerId],
      [async (customerId: string) => notification.sendSMS(customerId), input.customerId],
      [async () => notification.sendWebhook(), undefined]
    ]);

    const sent: Array<"email" | "sms" | "webhook"> = [];
    const failures: Array<{ channel: string; error: string }> = [];

    if (emailResult.type === "ok" && emailResult.data.success) {
      sent.push("email");
    } else {
      const error = emailResult.type === "ko"
        ? "Service error"
        : emailResult.data.error || "Unknown error";
      failures.push({ channel: "email", error });
    }

    if (smsResult.type === "ok" && smsResult.data.success) {
      sent.push("sms");
    } else {
      const error = smsResult.type === "ko"
        ? "Service error"
        : smsResult.data.error || "Unknown error";
      failures.push({ channel: "sms", error });
    }

    if (webhookResult.type === "ok" && webhookResult.data.success) {
      sent.push("webhook");
    } else {
      const error = webhookResult.type === "ko"
        ? "Service error"
        : webhookResult.data.error || "Unknown error";
      failures.push({ channel: "webhook", error });
    }

    if (sent.length === 0) {
      return ctx.ko({
        code: "ALL_CHANNELS_FAILED",
        message: "All notification channels failed",
        channelErrors: failures,
      });
    }

    logger.info("Notifications completed", { sent, failures: failures.length });

    return ctx.ok({ sent, failures });
  }
);

export const processOrder = processOrderFlow.handler(
  { db, shipping, logger },
  async ({ db, shipping, logger }, ctx, input) => {
    logger.info("Starting order processing", { customerId: input.customerId });

    ctx.set("customerId", input.customerId);
    ctx.set("traceId", `trace-${Date.now()}`);

    const validationResult = await ctx.execute(validateOrder, input);
    if (validationResult.type === "ko") {
      logger.error("Order validation failed", validationResult.data);
      return ctx.ko({
        code: "VALIDATION",
        message: validationResult.data.message,
        details: validationResult.data,
      });
    }

    const paymentResult = await ctx.execute(processPayment, {
      amount: validationResult.data.totalWithTax,
      method: input.payment.method,
      token: input.payment.token,
      customerId: input.customerId,
    });

    if (paymentResult.type === "ko") {
      logger.error("Payment processing failed", paymentResult.data);
      return ctx.ko({
        code: "PAYMENT",
        message: paymentResult.data.message,
        details: paymentResult.data,
      });
    }

    const orderResult = await ctx.execute(
      async () => db.createOrder(),
      undefined
    );

    if (orderResult.type === "ko") {
      logger.error("Order creation failed", orderResult.data);
      return ctx.ko({
        code: "SYSTEM",
        message: "Failed to create order",
        details: orderResult.data,
      });
    }

    const orderId = orderResult.data;
    ctx.set("orderId", orderId);

    const inventoryResult = await ctx.execute(updateInventory, {
      items: input.items,
      orderId,
    });

    if (inventoryResult.type === "ko") {
      logger.error("Inventory update failed", inventoryResult.data);
      return ctx.ko({
        code: "INVENTORY",
        message: inventoryResult.data.message,
        details: inventoryResult.data,
      });
    }

    const shippingResult = await ctx.executeParallel([
      [async () => shipping.generateTrackingNumber(), undefined],
      [async (items: typeof input.items, address: typeof input.shipping) =>
        shipping.calculateShipping(items, address), [input.items, input.shipping]]
    ]);

    if (shippingResult[0].type === "ko") {
      logger.error("Tracking number generation failed", shippingResult[0].data);
      return ctx.ko({
        code: "SYSTEM",
        message: "Failed to generate tracking number",
        details: shippingResult[0].data,
      });
    }

    if (shippingResult[1].type === "ko") {
      logger.error("Shipping calculation failed", shippingResult[1].data);
      return ctx.ko({
        code: "SYSTEM",
        message: "Failed to calculate shipping",
        details: shippingResult[1].data,
      });
    }

    const trackingNumber = shippingResult[0].data;
    const shippingInfo = shippingResult[1].data;
    const estimatedDelivery = new Date();
    if (typeof shippingInfo === 'object' && shippingInfo && 'estimatedDays' in shippingInfo) {
      estimatedDelivery.setDate(estimatedDelivery.getDate() + shippingInfo.estimatedDays);
    } else {
      estimatedDelivery.setDate(estimatedDelivery.getDate() + 7); // fallback
    }

    const notificationResult = await ctx.execute(sendNotifications, {
      orderId,
      customerId: input.customerId,
      total: validationResult.data.totalWithTax,
      trackingNumber: typeof trackingNumber === 'string' ? trackingNumber : 'TRK123',
    });

    if (notificationResult.type === "ko") {
      logger.warn("Notifications failed but order completed", notificationResult.data);
    }

    logger.info("Order processing completed", { orderId, total: validationResult.data.totalWithTax });

    return ctx.ok({
      orderId,
      total: validationResult.data.totalWithTax,
      estimatedDelivery,
      trackingNumber: typeof trackingNumber === 'string' ? trackingNumber : 'TRK123',
    });
  }
);