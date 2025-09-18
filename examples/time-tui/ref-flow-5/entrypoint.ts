import { flow, createScope } from "@pumped-fn/core-next";
import { processOrderFlow, processOrder } from "./flows";
import type { Order } from "./types";

async function main() {
  const scope = createScope();

  try {
    console.log("=== E-Commerce Order Processing Demo ===\n");

    const successOrder: Order.Input = {
      items: [
        { productId: "item1", quantity: 2 },
        { productId: "item2", quantity: 1 },
      ],
      customerId: "cust123",
      payment: { method: "card", token: "valid-token" },
      shipping: { address: "123 Main St", city: "New York", zip: "10001" },
    };

    console.log("1. Processing successful order...");
    console.log("Input:", JSON.stringify(successOrder, null, 2));

    const successResult = await flow.execute(processOrder, successOrder, { scope });

    if (successResult.type === "ok") {
      console.log("✅ Success:", JSON.stringify(successResult.data, null, 2));
    } else {
      console.log("❌ Failed:", JSON.stringify(successResult.data, null, 2));
    }

    console.log("\n" + "=".repeat(50) + "\n");

    const failedOrder: Order.Input = {
      items: [
        { productId: "item3", quantity: 1 },
        { productId: "item1", quantity: 20 },
      ],
      customerId: "cust456",
      payment: { method: "paypal", token: "valid-token" },
      shipping: { address: "456 Oak Ave", city: "Boston", zip: "02101" },
    };

    console.log("2. Processing order with insufficient inventory...");
    console.log("Input:", JSON.stringify(failedOrder, null, 2));

    const failResult = await flow.execute(processOrder, failedOrder, { scope });

    if (failResult.type === "ok") {
      console.log("✅ Success:", JSON.stringify(failResult.data, null, 2));
    } else {
      console.log("❌ Failed:", JSON.stringify(failResult.data, null, 2));
    }

    console.log("\n" + "=".repeat(50) + "\n");

    const paymentFailOrder: Order.Input = {
      items: [{ productId: "item1", quantity: 1 }],
      customerId: "cust789",
      payment: { method: "card", token: "declined" },
      shipping: { address: "789 Pine St", city: "Seattle", zip: "98101" },
    };

    console.log("3. Processing order with payment failure...");
    console.log("Input:", JSON.stringify(paymentFailOrder, null, 2));

    const payFailResult = await flow.execute(processOrder, paymentFailOrder, { scope });

    if (payFailResult.type === "ok") {
      console.log("✅ Success:", JSON.stringify(payFailResult.data, null, 2));
    } else {
      console.log("❌ Failed:", JSON.stringify(payFailResult.data, null, 2));
    }

    console.log("\n" + "=".repeat(50) + "\n");

    const addressFailOrder: Order.Input = {
      items: [{ productId: "item1", quantity: 1 }],
      customerId: "cust101",
      payment: { method: "card", token: "valid-token" },
      shipping: { address: "Invalid Address", city: "Unknown", zip: "00000" },
    };

    console.log("4. Processing order with invalid address...");
    console.log("Input:", JSON.stringify(addressFailOrder, null, 2));

    const addressFailResult = await flow.execute(processOrder, addressFailOrder, { scope });

    if (addressFailResult.type === "ok") {
      console.log("✅ Success:", JSON.stringify(addressFailResult.data, null, 2));
    } else {
      console.log("❌ Failed:", JSON.stringify(addressFailResult.data, null, 2));
    }

    console.log("\n=== Demo Complete ===");

  } catch (error) {
    console.error("System error:", error);
  } finally {
    await scope.dispose();
  }
}

main().catch(console.error);