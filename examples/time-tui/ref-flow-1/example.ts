import { flow, createScope } from "@pumped-fn/core-next";
import { processOrder } from "./handlers";
import { type Order } from "./types";

async function runOrderExample() {
  const scope = createScope();

  try {
    const successfulOrder: Order.Input = {
      items: [
        { productId: "prod-1", quantity: 2 },
        { productId: "prod-2", quantity: 1 },
      ],
      customerId: "customer-123",
      payment: { method: "card", token: "valid-token" },
      shipping: { address: "123 Main St", city: "Seattle", zip: "98101" },
    };

    console.log("=== Processing Successful Order ===");
    const result = await flow.execute(processOrder, successfulOrder, { scope });

    if (result.type === "ok") {
      console.log("Order Success:", result.data);
    } else {
      console.log("Order Failed:", result.data);
    }

    console.log("\n=== Processing Order with Insufficient Inventory ===");
    const inventoryFailOrder: Order.Input = {
      ...successfulOrder,
      items: [{ productId: "prod-3", quantity: 1 }],
    };

    const inventoryResult = await flow.execute(processOrder, inventoryFailOrder, { scope });
    if (inventoryResult.type === "ko") {
      console.log("Expected Inventory Failure:", inventoryResult.data);
    }

    console.log("\n=== Processing Order with Payment Failure ===");
    const paymentFailOrder: Order.Input = {
      ...successfulOrder,
      payment: { method: "card", token: "invalid" },
    };

    const paymentResult = await flow.execute(processOrder, paymentFailOrder, { scope });
    if (paymentResult.type === "ko") {
      console.log("Expected Payment Failure:", paymentResult.data);
    }

    console.log("\n=== Processing Order with Invalid Address ===");
    const addressFailOrder: Order.Input = {
      ...successfulOrder,
      shipping: { address: "123 Main St", city: "Seattle", zip: "123" },
    };

    const addressResult = await flow.execute(processOrder, addressFailOrder, { scope });
    if (addressResult.type === "ko") {
      console.log("Expected Address Failure:", addressResult.data);
    }

  } catch (error) {
    console.error("Unexpected error:", error);
  } finally {
    await scope.dispose();
  }
}

async function main() {
  console.log("E-Commerce Order Processing Flow Example");
  console.log("==========================================\n");

  await runOrderExample();
}

main().catch(console.error);