import { provide, name } from "@pumped-fn/core-next";
import { type Services } from "./types";

export const db = provide(
  (): Services.Database => ({
    async findCustomer(customerId: string) {
      if (customerId === "invalid") return null;
      return customerId === "suspended"
        ? { status: "suspended" }
        : { status: "active" };
    },

    async checkInventory(_productId: string) {
      return { available: 10, price: 29.99 };
    },

    async reserveItems() {
      return true;
    },

    async createOrder() {
      return `order-${Date.now()}`;
    },
  }),
  name("db")
);

export const payment = provide(
  (): Services.PaymentGateway => ({
    async processPayment({ token }) {
      if (token === "invalid") {
        return { error: "Invalid payment method", declineCode: "INVALID_PAYMENT" };
      }
      if (token === "insufficient") {
        return { error: "Insufficient funds", declineCode: "INSUFFICIENT_FUNDS" };
      }
      return { transactionId: `txn-${Date.now()}` };
    },
  }),
  name("payment")
);

export const notification = provide(
  (): Services.NotificationService => ({
    async sendEmail(customerId: string) {
      return customerId === "no-email"
        ? { success: false, error: "No email address" }
        : { success: true };
    },

    async sendSMS(customerId: string) {
      return customerId === "no-sms"
        ? { success: false, error: "No phone number" }
        : { success: true };
    },

    async sendWebhook() {
      return { success: true };
    },
  }),
  name("notification")
);

export const shipping = provide(
  (): Services.ShippingService => ({
    async validateAddress(address) {
      return address.zip === "invalid"
        ? { valid: false, error: "Invalid zip code" }
        : { valid: true };
    },

    async calculateShipping() {
      return { estimatedDays: 3, cost: 9.99 };
    },

    generateTrackingNumber() {
      return `TRK${Date.now()}`;
    },
  }),
  name("shipping")
);

export const logger = provide(
  (): Services.Logger => ({
    info(message: string, data?: unknown) {
      console.log(`[INFO] ${message}`, data || "");
    },

    error(message: string, data?: unknown) {
      console.error(`[ERROR] ${message}`, data || "");
    },

    warn(message: string, data?: unknown) {
      console.warn(`[WARN] ${message}`, data || "");
    },
  }),
  name("logger")
);