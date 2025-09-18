import { custom } from "@pumped-fn/core-next";

export namespace Order {
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

export namespace Validation {
  export type Input = {
    items: Array<{ productId: string; quantity: number }>;
    customerId: string;
    shipping: { address: string; city: string; zip: string };
  };

  export type Success = {
    total: number;
    availableItems: Array<{ productId: string; quantity: number; price: number }>;
    validShipping: { address: string; city: string; zip: string; cost: number };
  };

  export type Error = {
    code: "INVALID_ITEMS" | "INVALID_ADDRESS" | "CUSTOMER_INACTIVE";
    message: string;
    details?: unknown;
  };
}

export namespace Payment {
  export type Input = {
    amount: number;
    method: "card" | "paypal";
    token: string;
    customerId: string;
  };

  export type Success = {
    transactionId: string;
    amount: number;
    method: string;
  };

  export type Error = {
    code: "PAYMENT_DECLINED" | "INVALID_TOKEN" | "INSUFFICIENT_FUNDS";
    message: string;
    details?: unknown;
  };
}

export namespace Inventory {
  export type Input = {
    items: Array<{ productId: string; quantity: number }>;
    orderId: string;
  };

  export type Success = {
    reservedItems: Array<{ productId: string; quantity: number; stockAfter: number }>;
    reorderAlerts: Array<{ productId: string; currentStock: number; threshold: number }>;
  };

  export type Error = {
    code: "INSUFFICIENT_STOCK" | "RESERVATION_FAILED";
    message: string;
    details?: unknown;
  };
}

export namespace Notification {
  export type Input = {
    orderId: string;
    customerId: string;
    total: number;
    trackingNumber: string;
    estimatedDelivery: Date;
  };

  export type Success = {
    emailSent: boolean;
    smsSent: boolean;
    webhookSent: boolean;
  };

  export type Error = {
    code: "EMAIL_FAILED" | "SMS_FAILED" | "WEBHOOK_FAILED";
    message: string;
    details?: unknown;
  };
}

export const orderInputSchema = custom<Order.Input>();
export const orderSuccessSchema = custom<Order.Success>();
export const orderErrorSchema = custom<Order.Error>();

export const validationInputSchema = custom<Validation.Input>();
export const validationSuccessSchema = custom<Validation.Success>();
export const validationErrorSchema = custom<Validation.Error>();

export const paymentInputSchema = custom<Payment.Input>();
export const paymentSuccessSchema = custom<Payment.Success>();
export const paymentErrorSchema = custom<Payment.Error>();

export const inventoryInputSchema = custom<Inventory.Input>();
export const inventorySuccessSchema = custom<Inventory.Success>();
export const inventoryErrorSchema = custom<Inventory.Error>();

export const notificationInputSchema = custom<Notification.Input>();
export const notificationSuccessSchema = custom<Notification.Success>();
export const notificationErrorSchema = custom<Notification.Error>();