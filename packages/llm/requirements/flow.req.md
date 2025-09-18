# Sample Flow Requirement: E-Commerce Order Processing

## Overview
Build an order processing flow for an e-commerce system that handles order validation, payment processing, inventory management, and notifications.

## Business Requirements

### Main Flow: processOrder
- **Input**: Order details including items, customer info, payment method, shipping address
- **Success**: Order confirmation with orderId, estimated delivery, total cost
- **Error**: Detailed error with reason (insufficient inventory, payment failed, invalid address)

### Sub-flows Required

1. **validateOrder**
   - Check all items are available
   - Validate shipping address format
   - Verify customer account status
   - Calculate total with tax

2. **processPayment**
   - Charge payment method
   - Handle different payment types (credit card, PayPal, store credit)
   - Return transaction ID or failure reason

3. **updateInventory**
   - Reserve items from inventory
   - Update stock levels
   - Trigger restock if below threshold

4. **sendNotifications** (parallel)
   - Email confirmation to customer
   - SMS tracking number
   - Webhook to fulfillment center

## Technical Requirements

### Dependencies
- `db`: Database service for inventory, orders, customers
- `payment`: Payment gateway service
- `notification`: Multi-channel notification service
- `shipping`: Shipping calculation service
- `logger`: Structured logging service

### Flow Execution Pattern
```
processOrder
├── validateOrder (sequential)
│   ├── checkInventory
│   ├── validateAddress
│   └── calculatePricing
├── processPayment (sequential, depends on validation)
├── updateInventory (sequential, after payment)
└── sendNotifications (parallel, after inventory)
    ├── sendEmail
    ├── sendSMS
    └── notifyFulfillment
```

### Context Management
- Store `orderId` in context after creation
- Pass `traceId` through all nested flows
- Maintain `customerId` for audit trail

### Error Scenarios
1. **Insufficient Inventory**: Return specific items out of stock
2. **Payment Declined**: Include decline code from payment processor
3. **Invalid Address**: Return validation errors from shipping service
4. **Partial Failure**: If notifications fail, still complete order but log warning

### Expected Implementation

```typescript
// Types
type OrderInput = {
  items: Array<{ productId: string; quantity: number }>;
  customerId: string;
  payment: { method: "card" | "paypal"; token: string };
  shipping: { address: string; city: string; zip: string };
};

type OrderSuccess = {
  orderId: string;
  total: number;
  estimatedDelivery: Date;
  trackingNumber: string;
};

type OrderError = {
  code: "INVENTORY" | "PAYMENT" | "VALIDATION" | "SYSTEM";
  message: string;
  details?: unknown;
};

// The flow should:
// 1. Validate entire order first
// 2. Process payment only if valid
// 3. Update inventory after successful payment
// 4. Send all notifications in parallel
// 5. Rollback inventory if any critical step fails
// 6. Return comprehensive error information
```

### Validation Criteria
- All schema validations pass
- Nested flows execute in correct order
- Parallel notifications complete independently
- Context propagates through all nested flows
- Error transformations maintain business context
- Dependencies are properly injected and typed