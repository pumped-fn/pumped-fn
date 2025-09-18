import { provide, name } from "@pumped-fn/core-next";

export const db = provide(() => {
  const getInventory = async (productId: string) => {
    const inventory = {
      "item1": { available: 10, price: 100 },
      "item2": { available: 5, price: 200 },
      "item3": { available: 0, price: 150 },
    };
    return inventory[productId as keyof typeof inventory] || { available: 0, price: 0 };
  };

  return {
    async findCustomer(customerId: string) {
      if (customerId === "inactive") return null;
      return { id: customerId, status: "active", email: `${customerId}@example.com` };
    },

    getInventory,

    async reserveInventory(items: Array<{ productId: string; quantity: number }>): Promise<{
      reserved: Array<{ productId: string; quantity: number; stockAfter: number }>;
      alerts: Array<{ productId: string; currentStock: number; threshold: number }>;
    }> {
      const reserved: Array<{ productId: string; quantity: number; stockAfter: number }> = [];
      const alerts: Array<{ productId: string; currentStock: number; threshold: number }> = [];

      for (const item of items) {
        const stock = await getInventory(item.productId);
        if (stock.available >= item.quantity) {
          const stockAfter: number = stock.available - item.quantity;
          reserved.push({ ...item, stockAfter });
          if (stockAfter < 3) {
            alerts.push({ productId: item.productId, currentStock: stockAfter, threshold: 3 });
          }
        } else {
          throw new Error(`Insufficient stock for ${item.productId}`);
        }
      }

      return { reserved, alerts };
    },

    async createOrder(input: any) {
      return {
        orderId: `order-${Date.now()}`,
        createdAt: new Date(),
      };
    }
  };
}, name("db"));

export const payment = provide(() => ({
  async charge(amount: number, method: string, token: string): Promise<{ transactionId: string; amount: number; method: string }> {
    if (token === "invalid") {
      throw new Error("Invalid payment token");
    }
    if (token === "declined") {
      throw new Error("Payment declined by issuer");
    }
    if (amount > 10000) {
      throw new Error("Amount exceeds limit");
    }

    return {
      transactionId: `txn-${Date.now()}`,
      amount,
      method,
    };
  }
}), name("payment"));

export const notification = provide(() => ({
  async sendEmail(customerId: string, orderId: string): Promise<boolean> {
    if (customerId === "no-email") {
      throw new Error("Email delivery failed");
    }
    return true;
  },

  async sendSms(customerId: string): Promise<boolean> {
    if (customerId === "no-sms") {
      throw new Error("SMS delivery failed");
    }
    return true;
  },

  async sendWebhook(orderId: string): Promise<boolean> {
    if (orderId.includes("webhook-fail")) {
      throw new Error("Webhook delivery failed");
    }
    return true;
  }
}), name("notification"));

export const shipping = provide(() => ({
  async validateAddress(address: { address: string; city: string; zip: string }) {
    if (!address.address || !address.city || !address.zip) {
      throw new Error("Incomplete address");
    }
    if (address.zip === "00000") {
      throw new Error("Invalid zip code");
    }

    return {
      ...address,
      cost: 15.99,
    };
  },

  async calculateDelivery(): Promise<{ estimatedDelivery: Date; trackingNumber: string }> {
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return {
      estimatedDelivery: deliveryDate,
      trackingNumber: `TRK-${Date.now()}`,
    };
  }
}), name("shipping"));

export const logger = provide(() => ({
  info(message: string, data?: any) {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data) : "");
  },

  error(message: string, error?: any) {
    console.error(`[ERROR] ${message}`, error?.message || error);
  },

  warn(message: string, data?: any) {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data) : "");
  }
}), name("logger"));