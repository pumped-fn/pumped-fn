import { flow } from "@pumped-fn/core-next";
import { executes } from "@pumped-fn/core-next";
const { Service } = executes;
import {
  validationInputSchema,
  validationSuccessSchema,
  validationErrorSchema,
  paymentInputSchema,
  paymentSuccessSchema,
  paymentErrorSchema,
  inventoryInputSchema,
  inventorySuccessSchema,
  inventoryErrorSchema,
  notificationInputSchema,
  notificationSuccessSchema,
  notificationErrorSchema,
  orderInputSchema,
  orderSuccessSchema,
  orderErrorSchema,
} from "./types";
import { db, payment, notification, shipping, logger } from "./services";

export const validateOrderFlow = flow.define({
  name: "validateOrder",
  input: validationInputSchema,
  success: validationSuccessSchema,
  error: validationErrorSchema,
});

export const validateOrder = validateOrderFlow.handler(
  { db, shipping, logger },
  async ({ db, shipping, logger }, ctx, input) => {
    logger.info("Validating order", { customerId: input.customerId, itemCount: input.items.length });

    const customerResult = await ctx.execute(
      async (customerId: string) => db.findCustomer(customerId),
      input.customerId
    );

    if (customerResult.type === "ko") {
      logger.error("Customer lookup failed", customerResult.data);
      return ctx.ko({
        code: "CUSTOMER_INACTIVE",
        message: "Customer lookup failed",
        details: customerResult.data,
      });
    }

    if (!customerResult.data) {
      return ctx.ko({
        code: "CUSTOMER_INACTIVE",
        message: `Customer ${input.customerId} not found or inactive`,
      });
    }

    const shippingResult = await ctx.execute(
      async (address: typeof input.shipping) => shipping.validateAddress(address),
      input.shipping
    );

    if (shippingResult.type === "ko") {
      logger.error("Address validation failed", shippingResult.data);
      return ctx.ko({
        code: "INVALID_ADDRESS",
        message: shippingResult.data instanceof Error ? shippingResult.data.message : "Address validation failed",
        details: shippingResult.data,
      });
    }

    const validShipping = shippingResult.data;
    const availableItems = [];
    let total = 0;

    for (const item of input.items) {
      const stockResult = await ctx.execute(
        async (productId: string) => db.getInventory(productId),
        item.productId
      );

      if (stockResult.type === "ko") {
        logger.error("Inventory lookup failed", { productId: item.productId, error: stockResult.data });
        return ctx.ko({
          code: "INVALID_ITEMS",
          message: `Inventory lookup failed for ${item.productId}`,
          details: stockResult.data,
        });
      }

      const stock = stockResult.data;
      if (stock.available < item.quantity) {
        return ctx.ko({
          code: "INVALID_ITEMS",
          message: `Insufficient inventory for ${item.productId}: requested ${item.quantity}, available ${stock.available}`,
          details: { productId: item.productId, requested: item.quantity, available: stock.available },
        });
      }
      availableItems.push({ ...item, price: stock.price });
      total += stock.price * item.quantity;
    }

    total += validShipping.cost;

    return ctx.ok({
      total,
      availableItems,
      validShipping,
    });
  }
);

export const processPaymentFlow = flow.define({
  name: "processPayment",
  input: paymentInputSchema,
  success: paymentSuccessSchema,
  error: paymentErrorSchema,
});

export const processPayment = processPaymentFlow.handler(
  { payment, logger },
  async ({ payment, logger }, ctx, input) => {
    logger.info("Processing payment", { amount: input.amount, method: input.method });

    const paymentResult = await ctx.execute(
      async (amount: number, method: string, token: string) =>
        payment.charge(amount, method, token),
      [input.amount, input.method, input.token]
    );

    if (paymentResult.type === "ko") {
      logger.error("Payment failed", paymentResult.data);

      const error = paymentResult.data;
      if (error instanceof Error) {
        if (error.message.includes("Invalid")) {
          return ctx.ko({
            code: "INVALID_TOKEN",
            message: error.message,
            details: error,
          });
        }
        if (error.message.includes("declined")) {
          return ctx.ko({
            code: "PAYMENT_DECLINED",
            message: error.message,
            details: error,
          });
        }
        if (error.message.includes("exceeds")) {
          return ctx.ko({
            code: "INSUFFICIENT_FUNDS",
            message: error.message,
            details: error,
          });
        }
      }

      return ctx.ko({
        code: "PAYMENT_DECLINED",
        message: error instanceof Error ? error.message : "Payment processing failed",
        details: error,
      });
    }

    logger.info("Payment successful", { transactionId: paymentResult.data.transactionId });
    return ctx.ok(paymentResult.data);
  }
);

export const updateInventoryFlow = flow.define({
  name: "updateInventory",
  input: inventoryInputSchema,
  success: inventorySuccessSchema,
  error: inventoryErrorSchema,
});

export const updateInventory = updateInventoryFlow.handler(
  { db, logger },
  async ({ db, logger }, ctx, input) => {
    logger.info("Updating inventory", { orderId: input.orderId, itemCount: input.items.length });

    const inventoryResult = await ctx.execute(
      async (items: typeof input.items) => db.reserveInventory(items),
      input.items
    );

    if (inventoryResult.type === "ko") {
      logger.error("Inventory update failed", inventoryResult.data);
      return ctx.ko({
        code: "RESERVATION_FAILED",
        message: inventoryResult.data instanceof Error ? inventoryResult.data.message : "Inventory reservation failed",
        details: inventoryResult.data,
      });
    }

    const { reserved, alerts } = inventoryResult.data;

    if (alerts.length > 0) {
      logger.warn("Low stock alerts", { alerts });
    }

    return ctx.ok({
      reservedItems: reserved,
      reorderAlerts: alerts,
    });
  }
);

const sendEmailFlow = flow.define({
  name: "sendEmail",
  input: notificationInputSchema,
  success: notificationSuccessSchema,
  error: notificationErrorSchema,
});

const sendEmail = sendEmailFlow.handler(
  { notification, logger },
  async ({ notification, logger }, ctx, input) => {
    const emailResult = await ctx.execute(
      async (customerId: string, orderId: string) =>
        notification.sendEmail(customerId, orderId),
      [input.customerId, input.orderId]
    );

    if (emailResult.type === "ko") {
      logger.warn("Email notification failed", emailResult.data);
      return ctx.ko({
        code: "EMAIL_FAILED",
        message: emailResult.data instanceof Error ? emailResult.data.message : "Email failed",
        details: emailResult.data,
      });
    }

    return ctx.ok({ emailSent: true, smsSent: false, webhookSent: false });
  }
);

const sendSmsFlow = flow.define({
  name: "sendSms",
  input: notificationInputSchema,
  success: notificationSuccessSchema,
  error: notificationErrorSchema,
});

const sendSms = sendSmsFlow.handler(
  { notification, logger },
  async ({ notification, logger }, ctx, input) => {
    const smsResult = await ctx.execute(
      async (customerId: string) => notification.sendSms(customerId),
      input.customerId
    );

    if (smsResult.type === "ko") {
      logger.warn("SMS notification failed", smsResult.data);
      return ctx.ko({
        code: "SMS_FAILED",
        message: smsResult.data instanceof Error ? smsResult.data.message : "SMS failed",
        details: smsResult.data,
      });
    }

    return ctx.ok({ emailSent: false, smsSent: true, webhookSent: false });
  }
);

const sendWebhookFlow = flow.define({
  name: "sendWebhook",
  input: notificationInputSchema,
  success: notificationSuccessSchema,
  error: notificationErrorSchema,
});

const sendWebhook = sendWebhookFlow.handler(
  { notification, logger },
  async ({ notification, logger }, ctx, input) => {
    const webhookResult = await ctx.execute(
      async (orderId: string) => notification.sendWebhook(orderId),
      input.orderId
    );

    if (webhookResult.type === "ko") {
      logger.warn("Webhook notification failed", webhookResult.data);
      return ctx.ko({
        code: "WEBHOOK_FAILED",
        message: webhookResult.data instanceof Error ? webhookResult.data.message : "Webhook failed",
        details: webhookResult.data,
      });
    }

    return ctx.ok({ emailSent: false, smsSent: false, webhookSent: true });
  }
);

export const sendNotificationsFlow = flow.define({
  name: "sendNotifications",
  input: notificationInputSchema,
  success: notificationSuccessSchema,
  error: notificationErrorSchema,
});

export const sendNotifications = sendNotificationsFlow.handler(
  { logger },
  async ({ logger }, ctx, input) => {
    logger.info("Sending notifications", { orderId: input.orderId });

    const [emailResult, smsResult, webhookResult] = await ctx.executeParallel([
      [sendEmail, input],
      [sendSms, input],
      [sendWebhook, input],
    ]);

    const success = {
      emailSent: emailResult.type === "ok" ? emailResult.data.emailSent : false,
      smsSent: smsResult.type === "ok" ? smsResult.data.smsSent : false,
      webhookSent: webhookResult.type === "ok" ? webhookResult.data.webhookSent : false,
    };

    const failures = [];
    if (emailResult.type === "ko") failures.push(`Email: ${emailResult.data.message}`);
    if (smsResult.type === "ko") failures.push(`SMS: ${smsResult.data.message}`);
    if (webhookResult.type === "ko") failures.push(`Webhook: ${webhookResult.data.message}`);

    if (failures.length > 0) {
      logger.warn("Some notifications failed", { failures, success });
    }

    return ctx.ok(success);
  }
);

export const processOrderFlow = flow.define({
  name: "processOrder",
  input: orderInputSchema,
  success: orderSuccessSchema,
  error: orderErrorSchema,
});

export const processOrder = processOrderFlow.handler(
  { db, shipping, logger },
  async ({ db, shipping, logger }, ctx, input) => {
    const traceId = `trace-${Date.now()}`;
    ctx.set("traceId", traceId);

    logger.info("Processing order", { customerId: input.customerId, traceId });

    const validationResult = await ctx.execute(validateOrder, {
      items: input.items,
      customerId: input.customerId,
      shipping: input.shipping,
    });

    if (validationResult.type === "ko") {
      return ctx.ko({
        code: "VALIDATION",
        message: `Validation failed: ${validationResult.data.message}`,
        details: validationResult.data,
      });
    }

    const paymentResult = await ctx.execute(processPayment, {
      amount: validationResult.data.total,
      method: input.payment.method,
      token: input.payment.token,
      customerId: input.customerId,
    });

    if (paymentResult.type === "ko") {
      return ctx.ko({
        code: "PAYMENT",
        message: `Payment failed: ${paymentResult.data.message}`,
        details: paymentResult.data,
      });
    }

    const order = await db.createOrder(input);
    ctx.set("orderId", order.orderId);

    const inventoryResult = await ctx.execute(updateInventory, {
      items: input.items,
      orderId: order.orderId,
    });

    if (inventoryResult.type === "ko") {
      logger.error("Order failed after payment - manual rollback needed", {
        orderId: order.orderId,
        transactionId: paymentResult.data.transactionId,
        error: inventoryResult.data,
      });

      return ctx.ko({
        code: "INVENTORY",
        message: `Inventory reservation failed: ${inventoryResult.data.message}`,
        details: {
          ...inventoryResult.data,
          requiresRollback: {
            orderId: order.orderId,
            transactionId: paymentResult.data.transactionId,
          },
        },
      });
    }

    const shippingInfo = await shipping.calculateDelivery();

    const notificationResult = await ctx.execute(sendNotifications, {
      orderId: order.orderId,
      customerId: input.customerId,
      total: validationResult.data.total,
      trackingNumber: shippingInfo.trackingNumber,
      estimatedDelivery: shippingInfo.estimatedDelivery,
    });

    if (notificationResult.type === "ko") {
      logger.warn("Order completed but notifications failed", {
        orderId: order.orderId,
        notificationError: notificationResult.data,
      });
    }

    logger.info("Order processing completed", {
      orderId: order.orderId,
      total: validationResult.data.total,
      traceId,
    });

    return ctx.ok({
      orderId: order.orderId,
      total: validationResult.data.total,
      estimatedDelivery: shippingInfo.estimatedDelivery,
      trackingNumber: shippingInfo.trackingNumber,
    });
  }
);