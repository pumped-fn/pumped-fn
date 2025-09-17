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
    code: "INSUFFICIENT_INVENTORY" | "INVALID_ADDRESS" | "INVALID_CUSTOMER";
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
    code: "PAYMENT_DECLINED" | "INVALID_TOKEN" | "INSUFFICIENT_FUNDS";
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
    code: "RESERVATION_FAILED" | "CONCURRENT_UPDATE";
    message: string;
    failedItems?: Array<{ productId: string; requested: number; available: number }>;
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