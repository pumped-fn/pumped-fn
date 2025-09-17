import { flow, createScope } from "@pumped-fn/core-next";
import { processOrder } from "./handlers";
import { type Order } from "./types";

async function main() {
  const scope = createScope();

  try {
    const sampleOrder: Order.Input = {
      items: [
        { productId: "laptop", quantity: 1 },
        { productId: "mouse", quantity: 2 },
      ],
      customerId: "customer-123",
      payment: { method: "card", token: "tok_123" },
      shipping: { address: "123 Main St", city: "Seattle", zip: "98101" },
    };

    const result = await flow.execute(processOrder, sampleOrder, { scope });

    if (result.type === "ok") {
      console.log("Order completed:", result.data);
    } else {
      console.log("Order failed:", result.data);
    }

  } catch (error) {
    console.error("System error:", error);
  } finally {
    await scope.dispose();
  }
}

main().catch(console.error);