import { provide, name } from "@pumped-fn/core-next";

export namespace Dependencies {
  export interface Database {
    findCustomer(id: string): Promise<{ id: string; status: "active" | "suspended" } | null>;
    checkInventory(productId: string): Promise<{ available: number; price: number }>;
    reserveItems(items: Array<{ productId: string; quantity: number }>): Promise<boolean>;
    createOrder(): Promise<string>;
  }

  export interface PaymentGateway {
    processPayment(payment: { amount: number; method: string; token: string }): Promise<{ transactionId: string } | { error: string; declineCode?: string }>;
  }

  export interface NotificationService {
    sendEmail(customerId: string): Promise<{ success: boolean; error?: string }>;
    sendSMS(customerId: string): Promise<{ success: boolean; error?: string }>;
    sendWebhook(): Promise<{ success: boolean; error?: string }>;
  }

  export interface ShippingService {
    validateAddress(address: { address: string; city: string; zip: string }): Promise<{ valid: boolean; error?: string }>;
    calculateShipping(items: any[], address: any): Promise<{ cost: number; estimatedDays: number }>;
    generateTrackingNumber(): string;
  }

  export interface Logger {
    info(message: string, data?: any): void;
    error(message: string, error?: any): void;
    warn(message: string, data?: any): void;
  }
}

const mockDb = provide((): Dependencies.Database => ({
  async findCustomer(id: string) {
    if (id === "invalid") return null;
    return { id, status: id === "suspended" ? "suspended" : "active" };
  },

  async checkInventory(productId: string) {
    const inventory: Record<string, { available: number; price: number }> = {
      "prod-1": { available: 10, price: 100 },
      "prod-2": { available: 5, price: 200 },
      "prod-3": { available: 0, price: 50 },
    };
    return inventory[productId] || { available: 0, price: 0 };
  },

  async reserveItems(items) {
    return !items.some(item => item.productId === "prod-3");
  },

  async createOrder() {
    return `order-${Date.now()}`;
  },
}), name("db"));

const mockPayment = provide((): Dependencies.PaymentGateway => ({
  async processPayment(payment) {
    if (payment.token === "invalid") {
      return { error: "Payment declined", declineCode: "INVALID_CARD" };
    }
    if (payment.amount > 10000) {
      return { error: "Insufficient funds", declineCode: "INSUFFICIENT_FUNDS" };
    }
    return { transactionId: `tx-${Date.now()}` };
  },
}), name("payment"));

const mockNotification = provide((): Dependencies.NotificationService => ({
  async sendEmail(customerId) {
    if (customerId === "email-fail") return { success: false, error: "Email service down" };
    return { success: true };
  },

  async sendSMS(customerId) {
    if (customerId === "sms-fail") return { success: false, error: "SMS service unavailable" };
    return { success: true };
  },

  async sendWebhook() {
    return { success: true };
  },
}), name("notification"));

const mockShipping = provide((): Dependencies.ShippingService => ({
  async validateAddress(address) {
    if (!address.zip || address.zip.length < 5) {
      return { valid: false, error: "Invalid ZIP code" };
    }
    return { valid: true };
  },

  async calculateShipping(items, address) {
    const baseCost = items.length * 10;
    return { cost: baseCost, estimatedDays: 3 };
  },

  generateTrackingNumber() {
    return `TRACK-${Date.now()}`;
  },
}), name("shipping"));

const mockLogger = provide((): Dependencies.Logger => ({
  info(message, data) {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  },

  error(message, error) {
    console.error(`[ERROR] ${message}`, error);
  },

  warn(message, data) {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  },
}), name("logger"));

export const db = mockDb;
export const payment = mockPayment;
export const notification = mockNotification;
export const shipping = mockShipping;
export const logger = mockLogger;