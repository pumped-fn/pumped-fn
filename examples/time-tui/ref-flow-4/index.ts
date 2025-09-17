import { flow, createScope } from "@pumped-fn/core-next";
import { processOrder } from "./flows";

const app = async () => {
  const scope = createScope();

  try {
    const successOrder = {
      items: [
        { productId: "prod-1", quantity: 2 },
        { productId: "prod-3", quantity: 1 },
      ],
      customerId: "cust-1",
      payment: { method: "card" as const, token: "valid-token" },
      shipping: {
        address: "123 Main Street",
        city: "Springfield",
        zip: "12345",
      },
    };

    console.log("=== Processing Valid Order ===");
    const result1 = await flow.execute(processOrder, successOrder, { scope });

    if (result1.type === "ok") {
      console.log("Order successful:", result1.data);
    } else {
      console.log("Order failed:", result1.data);
    }

    const failureOrder = {
      items: [
        { productId: "prod-2", quantity: 10 },
        { productId: "prod-invalid", quantity: 1 },
      ],
      customerId: "cust-2",
      payment: { method: "card" as const, token: "invalid-token" },
      shipping: { address: "123", city: "A", zip: "invalid" },
    };

    console.log("\n=== Processing Invalid Order ===");
    const result2 = await flow.execute(processOrder, failureOrder, { scope });

    if (result2.type === "ok") {
      console.log("Order successful:", result2.data);
    } else {
      console.log("Order failed:", result2.data);
    }

    const inventoryFailureOrder = {
      items: [{ productId: "prod-2", quantity: 10 }],
      customerId: "cust-1",
      payment: { method: "paypal" as const, token: "valid-token" },
      shipping: { address: "456 Oak Avenue", city: "Riverside", zip: "67890" },
    };

    console.log("\n=== Processing Inventory Failure Order ===");
    const result3 = await flow.execute(processOrder, inventoryFailureOrder, {
      scope,
    });

    if (result3.type === "ok") {
      console.log("Order successful:", result3.data);
    } else {
      console.log("Order failed:", result3.data);
    }
  } catch (error) {
    console.error("Application error:", error);
  } finally {
    await scope.dispose();
  }
};

app().catch(console.error);
