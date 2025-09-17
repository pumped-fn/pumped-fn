import { flow, custom } from "@pumped-fn/core-next";
import { type Order, type Validation, type Payment, type Inventory, type Notification } from "./types";

export const validateOrderFlow = flow.define({
  name: "order.validate",
  input: custom<Validation.Input>(),
  success: custom<Validation.Success>(),
  error: custom<Validation.Error>(),
});

export const processPaymentFlow = flow.define({
  name: "payment.process",
  input: custom<Payment.Input>(),
  success: custom<Payment.Success>(),
  error: custom<Payment.Error>(),
});

export const updateInventoryFlow = flow.define({
  name: "inventory.update",
  input: custom<Inventory.Input>(),
  success: custom<Inventory.Success>(),
  error: custom<Inventory.Error>(),
});

export const sendNotificationsFlow = flow.define({
  name: "notifications.send",
  input: custom<Notification.Input>(),
  success: custom<Notification.Success>(),
  error: custom<Notification.Error>(),
});

export const processOrderFlow = flow.define({
  name: "order.process",
  input: custom<Order.Input>(),
  success: custom<Order.Success>(),
  error: custom<Order.Error>(),
});