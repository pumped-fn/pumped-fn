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

    const customer = await db.findCustomer(input.customerId);
    if (!customer) {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: `Customer ${input.customerId} not found`,
      });
    }

    if (customer.status === "suspended") {
      return ctx.ko({
        code: "INVALID_CUSTOMER",
        message: "Customer account is suspended",
      });
    }

    const addressValidation = await shipping.validateAddress(input.shipping);
    if (!addressValidation.valid) {
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: addressValidation.error || "Invalid shipping address",
      });
    }

    const availableItems = [];
    let totalWithTax = 0;

    for (const item of input.items) {
      const inventory = await db.checkInventory(item.productId);
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

    const result = await payment.processPayment({
      amount: input.amount,
      method: input.method,
      token: input.token,
    });

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

    const reserved = await db.reserveItems(input.items);
    if (!reserved) {
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

    const [emailResult, smsResult, webhookResult] = await Promise.all([
      notification.sendEmail(input.customerId),
      notification.sendSMS(input.customerId),
      notification.sendWebhook(),
    ]);

    const sent: Array<"email" | "sms" | "webhook"> = [];
    const failures: Array<{ channel: string; error: string }> = [];

    if (emailResult.success) {
      sent.push("email");
    } else {
      failures.push({ channel: "email", error: emailResult.error || "Unknown error" });
    }

    if (smsResult.success) {
      sent.push("sms");
    } else {
      failures.push({ channel: "sms", error: smsResult.error || "Unknown error" });
    }

    if (webhookResult.success) {
      sent.push("webhook");
    } else {
      failures.push({ channel: "webhook", error: webhookResult.error || "Unknown error" });
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

    const orderId = await db.createOrder();

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

    const trackingNumber = shipping.generateTrackingNumber();
    const shippingInfo = await shipping.calculateShipping(input.items, input.shipping);
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + shippingInfo.estimatedDays);

    const notificationResult = await ctx.execute(sendNotifications, {
      orderId,
      customerId: input.customerId,
      total: validationResult.data.totalWithTax,
      trackingNumber,
    });

    if (notificationResult.type === "ko") {
      logger.warn("Notifications failed but order completed", notificationResult.data);
    }

    logger.info("Order processing completed", { orderId, total: validationResult.data.totalWithTax });

    return ctx.ok({
      orderId,
      total: validationResult.data.totalWithTax,
      estimatedDelivery,
      trackingNumber,
    });
  }
);