import { provide, derive, name } from "@pumped-fn/core-next";

namespace ServiceTypes {
  export type Customer = {
    id: string;
    status: "active" | "suspended";
    email: string;
  };

  export type Product = {
    id: string;
    price: number;
    stock: number;
    threshold: number;
  };

  export type Order = {
    id: string;
    customerId: string;
    status: "pending" | "completed" | "failed";
    items: Array<{ productId: string; quantity: number }>;
    total?: number;
    createdAt: Date;
  };

  export type InventoryItem = {
    productId: string;
    quantity: number;
    price: number;
    available: boolean;
  };
}

const config = provide(
  () => ({
    db: { connectionString: "mock://db" },
    payment: { apiKey: "mock-key", sandbox: true },
    shipping: { apiEndpoint: "mock://shipping" },
    notification: { emailProvider: "mock", smsProvider: "mock" },
  }),
  name("config")
);

const db = derive(
  [config],
  ([cfg]) => {
    const customers = new Map<string, ServiceTypes.Customer>([
      ["cust-1", { id: "cust-1", status: "active", email: "user@test.com" }],
      [
        "cust-2",
        { id: "cust-2", status: "suspended", email: "user2@test.com" },
      ],
    ]);

    const products = new Map<string, ServiceTypes.Product>([
      ["prod-1", { id: "prod-1", price: 99.99, stock: 50, threshold: 10 }],
      ["prod-2", { id: "prod-2", price: 149.99, stock: 5, threshold: 10 }],
      ["prod-3", { id: "prod-3", price: 29.99, stock: 100, threshold: 20 }],
    ]);

    const orders = new Map<string, ServiceTypes.Order>();

    let orderCounter = 1;

    return {
      async validateCustomer(customerId: string): Promise<boolean> {
        const customer = customers.get(customerId);
        return customer?.status === "active";
      },

      async checkInventory(
        items: Array<{ productId: string; quantity: number }>
      ) {
        const checkedItems: ServiceTypes.InventoryItem[] = [];
        const unavailable: string[] = [];

        for (const item of items) {
          const product = products.get(item.productId);
          if (!product || product.stock < item.quantity) {
            unavailable.push(item.productId);
            checkedItems.push({
              ...item,
              price: product?.price ?? 0,
              available: false,
            });
          } else {
            checkedItems.push({
              ...item,
              price: product.price,
              available: true,
            });
          }
        }

        return {
          available: unavailable.length === 0,
          unavailable,
          items: checkedItems,
        };
      },

      async createOrder(input: any): Promise<string> {
        const orderId = `order-${orderCounter++}`;
        orders.set(orderId, {
          id: orderId,
          customerId: input.customerId,
          status: "pending",
          items: input.items,
          createdAt: new Date(),
        });
        return orderId;
      },

      async reserveItems(
        items: Array<{ productId: string; quantity: number }>,
        orderId: string
      ) {
        const errors: string[] = [];

        for (const item of items) {
          const product = products.get(item.productId);
          if (!product || product.stock < item.quantity) {
            errors.push(`Insufficient stock for ${item.productId}`);
          } else {
            product.stock -= item.quantity;
            products.set(item.productId, product);
          }
        }

        return {
          success: errors.length === 0,
          errors,
        };
      },

      async checkRestockThresholds(
        items: Array<{ productId: string; quantity: number }>
      ): Promise<string[]> {
        const restockNeeded: string[] = [];

        for (const item of items) {
          const product = products.get(item.productId);
          if (product && product.stock <= product.threshold) {
            restockNeeded.push(item.productId);
          }
        }

        return restockNeeded;
      },

      async markOrderFailed(orderId: string, reason: string): Promise<void> {
        const order = orders.get(orderId);
        if (order) {
          order.status = "failed";
          orders.set(orderId, order);
        }
      },

      async markOrderCompleted(
        orderId: string,
        details: {
          transactionId: string;
          trackingNumber: string;
          estimatedDelivery: Date;
        }
      ): Promise<void> {
        const order = orders.get(orderId);
        if (order) {
          order.status = "completed";
          orders.set(orderId, order);
        }
      },

      async generateTrackingNumber(orderId: string): Promise<string> {
        return `TRK-${orderId.toUpperCase()}-${Date.now()}`;
      },

      async calculateDelivery(shipping: any): Promise<Date> {
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3);
        return deliveryDate;
      },
    };
  },
  name("db")
);

const payment = derive(
  [config],
  ([cfg]) => ({
    async charge(params: {
      method: string;
      token: string;
      amount: number;
      customerId: string;
    }) {
      if (params.token === "invalid-token") {
        return {
          success: false,
          error: { code: "INVALID_TOKEN", message: "Token expired" },
        } as const;
      }

      if (params.amount > 1000) {
        return {
          success: false,
          error: { code: "AMOUNT_LIMIT", message: "Amount exceeds limit" },
        } as const;
      }

      return {
        success: true,
        transactionId: `txn-${Date.now()}`,
        amount: params.amount,
      } as const;
    },
  }),
  name("payment")
);

const shipping = derive(
  [config],
  ([cfg]) => ({
    async validateAddress(address: {
      address: string;
      city: string;
      zip: string;
    }): Promise<boolean> {
      return (
        address.address.length > 5 &&
        address.city.length > 2 &&
        /^\d{5}$/.test(address.zip)
      );
    },
  }),
  name("shipping")
);

const notification = derive(
  [config],
  ([cfg]) => ({
    async sendEmail(customerId: string, message: string): Promise<boolean> {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return true;
    },

    async sendSMS(customerId: string, message: string): Promise<boolean> {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return customerId !== "cust-fail";
    },

    async sendWebhook(data: {
      orderId: string;
      total: number;
    }): Promise<boolean> {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return true;
    },
  }),
  name("notification")
);

const logger = derive(
  [],
  () => ({
    info(message: string, meta?: any): void {
      console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta) : "");
    },

    warn(message: string, meta?: any): void {
      console.log(`[WARN] ${message}`, meta ? JSON.stringify(meta) : "");
    },

    error(message: string, meta?: any): void {
      console.log(`[ERROR] ${message}`, meta ? JSON.stringify(meta) : "");
    },
  }),
  name("logger")
);

export { db, payment, shipping, notification, logger };
