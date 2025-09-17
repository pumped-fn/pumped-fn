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
  export type Input = Order.Input;

  export type Success = {
    validated: true;
    totalWithTax: number;
    availableItems: Array<{ productId: string; available: number }>;
  };

  export type Error = {
    code: "INVALID_CUSTOMER" | "INVALID_ADDRESS" | "INSUFFICIENT_INVENTORY";
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
    status: "completed";
  };

  export type Error = {
    code: "INSUFFICIENT_FUNDS" | "PAYMENT_DECLINED";
    message: string;
    declineCode?: string;
  };
}

export namespace Inventory {
  export type Input = {
    items: Array<{ productId: string; quantity: number }>;
    orderId: string;
  };

  export type Success = {
    reserved: true;
    updatedStock: Array<{ productId: string; newStock: number }>;
  };

  export type Error = {
    code: "RESERVATION_FAILED";
    message: string;
    failedItems: Array<{ productId: string; requested: number; available: number }>;
  };
}

export namespace Notification {
  export type Input = {
    orderId: string;
    customerId: string;
    total: number;
    trackingNumber: string;
  };

  export type Success = {
    sent: Array<"email" | "sms" | "webhook">;
    failures: Array<{ channel: string; error: string }>;
  };

  export type Error = {
    code: "ALL_CHANNELS_FAILED";
    message: string;
    channelErrors: Array<{ channel: string; error: string }>;
  };
}

export namespace Services {
  export interface Database {
    findCustomer(customerId: string): Promise<{ status: string } | null>;
    checkInventory(productId: string): Promise<{ available: number; price: number }>;
    reserveItems(items: Array<{ productId: string; quantity: number }>): Promise<boolean>;
    createOrder(): Promise<string>;
  }

  export interface PaymentGateway {
    processPayment(params: {
      amount: number;
      method: string;
      token: string;
    }): Promise<
      { transactionId: string } | { error: string; declineCode: string }
    >;
  }

  export interface NotificationService {
    sendEmail(customerId: string): Promise<{ success: boolean; error?: string }>;
    sendSMS(customerId: string): Promise<{ success: boolean; error?: string }>;
    sendWebhook(): Promise<{ success: boolean; error?: string }>;
  }

  export interface ShippingService {
    validateAddress(address: { address: string; city: string; zip: string }): Promise<{
      valid: boolean;
      error?: string;
    }>;
    calculateShipping(
      items: Array<{ productId: string; quantity: number }>,
      address: { address: string; city: string; zip: string }
    ): Promise<{ estimatedDays: number; cost: number }>;
    generateTrackingNumber(): string;
  }

  export interface Logger {
    info(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
  }
}