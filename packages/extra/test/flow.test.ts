import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { provide, derive, createScope } from "@pumped-fn/core-next";
import { z } from "zod";
import {
  FlowScope,
  step,
  flow,
  execute,
  collect,
} from "../src/flow";

// Real-world mock services
const dbExecutor = provide(() => ({
  async findUser(email: string) {
    if (email === "notfound@example.com") {
      throw new Error("User not found");
    }
    if (email === "invalid@example.com") {
      throw new Error("Invalid user data");
    }
    return { 
      id: '123', 
      email, 
      name: 'John Doe',
      status: 'active',
      preferences: { theme: 'dark', notifications: true }
    };
  },

  async updateUser(user: any) {
    if (user.id === "fail-update") {
      throw new Error("Database update failed");
    }
    return { ...user, updatedAt: new Date().toISOString() };
  },

  async logActivity(activity: any) {
    return { id: 'log-123', ...activity, timestamp: Date.now() };
  }
}));

const emailServiceExecutor = provide(() => ({
  async sendEmail(to: string, template: string, data: any) {
    if (to === "bounce@example.com") {
      throw new Error("Email bounced");
    }
    if (template === "invalid-template") {
      throw new Error("Template not found");
    }
    
    // Simulate send delay
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return {
      messageId: `msg-${Date.now()}`,
      to,
      template,
      status: 'sent',
      data
    };
  },

  async sendSMS(phone: string, message: string) {
    if (phone === "+1-fail") {
      throw new Error("Invalid phone number");
    }
    return {
      messageId: `sms-${Date.now()}`,
      phone,
      status: 'sent'
    };
  }
}));

const paymentServiceExecutor = provide(() => ({
  async processPayment(amount: number, method: string) {
    if (amount > 10000) {
      throw new Error("Amount exceeds limit");
    }
    if (method === "invalid-card") {
      throw new Error("Payment method declined");
    }
    
    return {
      transactionId: `txn-${Date.now()}`,
      amount,
      status: 'completed',
      fee: amount * 0.03
    };
  },

  async refund(transactionId: string, amount: number) {
    if (transactionId === "invalid-txn") {
      throw new Error("Transaction not found");
    }
    return {
      refundId: `ref-${Date.now()}`,
      originalTransaction: transactionId,
      amount,
      status: 'processed'
    };
  }
}));

const configExecutor = provide(() => ({
  emailTemplates: {
    welcome: 'Welcome {{name}}! Your account is ready.',
    orderConfirmation: 'Order #{{orderId}} confirmed for {{amount}}',
    passwordReset: 'Reset your password: {{resetLink}}'
  },
  limits: {
    maxOrderAmount: 5000,
    maxRefundDays: 30
  },
  features: {
    smsNotifications: true,
    emailNotifications: true,
    auditLogging: true
  }
}));

// Schema definitions
const userInputSchema = z.object({
  email: z.string().email(),
  name: z.string().optional()
});

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  status: z.string(),
  preferences: z.object({
    theme: z.string(),
    notifications: z.boolean()
  })
});

const orderInputSchema = z.object({
  userId: z.string(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number()
  })),
  paymentMethod: z.string(),
  email: z.string().email(),
  phone: z.string().optional()
});

const orderSchema = z.object({
  orderId: z.string(),
  userId: z.string(),
  total: z.number(),
  status: z.string(),
  paymentId: z.string(),
  notifications: z.object({
    email: z.string().optional(),
    sms: z.string().optional()
  })
});

describe("Flow API - Real World Scenarios", () => {
  let appScope: ReturnType<typeof createScope>;

  beforeEach(async () => {
    appScope = createScope();
    // Pre-resolve app-level dependencies
    await appScope.resolve(dbExecutor);
    await appScope.resolve(emailServiceExecutor);
    await appScope.resolve(paymentServiceExecutor);
    await appScope.resolve(configExecutor);
  });

  afterEach(async () => {
    await appScope.dispose();
  });

  describe("Multi-Step User Onboarding Flow", () => {
    // Step 1: Validate and enrich user data
    const validateUserStep = step(
      userInputSchema,
      userSchema,
      derive({ db: dbExecutor }, ({ db }) => {
        return async function*(input) {
          const flowId = `validate-${Date.now()}`;
          
          try {
            const user = await db.findUser(input.email);
            yield { 
              type: 'step.progress', 
              step: 'validateUser', 
              data: { found: true, userId: user.id }
            };
            
            // Enrich with provided name if available
            const enrichedUser = { ...user, name: input.name || user.name };
            
            return enrichedUser;
          } catch (error) {
            yield { 
              type: 'step.error', 
              step: 'validateUser', 
              data: (error as Error).message
            };
            throw error;
          }
        };
      })
    );

    // Step 2: Send welcome email
    const sendWelcomeEmailStep = step(
      z.object({ user: userSchema }),
      z.object({ messageId: z.string(), status: z.string() }),
      derive({ emailService: emailServiceExecutor, config: configExecutor }, ({ emailService, config }) => {
        return async function*(input) {
          const flowId = `email-${Date.now()}`;
          
          try {
            const result = await emailService.sendEmail(
              input.user.email,
              'welcome',
              { name: input.user.name }
            );
            
            yield { 
              type: 'step.progress', 
              step: 'sendWelcomeEmail', 
              data: result
            };
            
            return { messageId: result.messageId, status: result.status };
          } catch (error) {
            yield { 
              type: 'step.error', 
              step: 'sendWelcomeEmail', 
              data: (error as Error).message
            };
            throw error;
          }
        };
      })
    );

    // Step 3: Log activity
    const logActivityStep = step(
      z.object({ 
        userId: z.string(), 
        action: z.string(), 
        metadata: z.record(z.any()) 
      }),
      z.object({ logId: z.string(), timestamp: z.number() }),
      derive({ db: dbExecutor }, ({ db }) => {
        return async (input: { userId: string; action: string; metadata: Record<string, any> }) => {
          // Simple Promise-based step - will be auto-wrapped as async generator
          const log = await db.logActivity({
            userId: input.userId,
            action: input.action,
            metadata: input.metadata
          });
          
          return { logId: log.id, timestamp: log.timestamp };
        };
      })
    );

    // Complete onboarding flow
    const userOnboardingFlow = flow(
      userInputSchema,
      z.object({
        user: userSchema,
        welcomeEmail: z.object({ messageId: z.string(), status: z.string() }),
        activityLog: z.object({ logId: z.string(), timestamp: z.number() }),
        flowId: z.string(),
        duration: z.number()
      }),
      derive({
        validateStep: validateUserStep,
        emailStep: sendWelcomeEmailStep,
        logStep: logActivityStep
      }, ({ validateStep, emailStep, logStep }) => {
        return async function*(input, scope) {
          const flowId = `onboarding-${Date.now()}`;
          const startTime = Date.now();
          
          yield { type: 'flow.start', flowId };
          
          // Step 1: Validate user (seamless yield*)
          const user = yield* validateStep(input);
          
          // Step 2: Send welcome email
          const welcomeEmail = yield* emailStep({ user });
          
          // Step 3: Log the onboarding activity (now also uses yield* since all steps are generators)
          const activityLog = yield* logStep({
            userId: user.id,
            action: 'user_onboarded',
            metadata: { email: user.email, name: user.name }
          });
          
          const duration = Date.now() - startTime;
          
          yield { type: 'flow.complete', flowId };
          
          return {
            user,
            welcomeEmail,
            activityLog,
            flowId: 'auto-generated',
            duration
          };
        };
      })
    );

    it("should complete successful onboarding flow", async () => {
      const events: any[] = [];
      
      const result = await execute(userOnboardingFlow, {
        email: "user@example.com",
        name: "Jane Doe"
      }, {
        parentScope: appScope,
        onEvent: (event) => events.push(event)
      });

      // Verify flow structure
      const flowStartComplete = result.events.filter(e => e.type === 'flow.start' || e.type === 'flow.complete');
      expect(flowStartComplete).toHaveLength(2); // flow.start + flow.complete
      expect(events.length).toBeGreaterThanOrEqual(2); // Auto-generated flow events + step events
      
      // Verify flow completion
      expect(result.result.user.email).toBe("user@example.com");
      expect(result.result.welcomeEmail.status).toBe("sent");
      expect(result.result.activityLog.logId).toBeDefined();
      expect(result.result.duration).toBeGreaterThan(0);
      
      // Verify event sequence
      expect(events[0].type).toBe('flow.start');
      expect(events.some(e => e.type === 'flow.progress' && e.step === 'validateUser')).toBe(true);
      expect(events[events.length - 1].type).toBe('flow.complete');
    });

    it("should handle user validation failure", async () => {
      const events: any[] = [];
      
      await expect(execute(userOnboardingFlow, {
        email: "notfound@example.com"
      }, {
        parentScope: appScope,
        onEvent: (event) => events.push(event)
      })).rejects.toThrow("User not found");

      // Should have flow start and error events that show validation error
      expect(events.some(e => e.type === 'flow.start')).toBe(true);
      expect(events.some(e => e.type === 'flow.error' && e.step === 'validateUser')).toBe(true);
    });

    it("should handle email service failure", async () => {
      const events: any[] = [];
      
      await expect(execute(userOnboardingFlow, {
        email: "bounce@example.com"
      }, {
        parentScope: appScope,
        onEvent: (event) => events.push(event)
      })).rejects.toThrow("Email bounced");

      // Should complete user validation but fail on email
      expect(events.some(e => e.type === 'flow.progress' && e.step === 'validateUser')).toBe(true);
      expect(events.some(e => e.type === 'flow.error' && e.step === 'sendWelcomeEmail')).toBe(true);
    });
  });

  describe("E-commerce Order Processing Flow", () => {
    // Calculate order total step (simple Promise-based)
    const calculateTotalStep = step(
      z.object({ items: z.array(z.object({
        price: z.number(),
        quantity: z.number()
      })) }),
      z.object({ total: z.number(), itemCount: z.number() }),
      provide(() => {
        return async (input: { items: Array<{ price: number; quantity: number }> }) => {
          // Simple calculation - just return the result (Promise-based, auto-wrapped)
          const total = input.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          const itemCount = input.items.reduce((sum, item) => sum + item.quantity, 0);
          
          return { total, itemCount };
        };
      })
    );

    // Process payment step
    const processPaymentStep = step(
      z.object({ total: z.number(), paymentMethod: z.string() }),
      z.object({ transactionId: z.string(), status: z.string(), fee: z.number() }),
      derive({ paymentService: paymentServiceExecutor }, ({ paymentService }) => {
        return async function*(input) {
          const flowId = `payment-${Date.now()}`;
          
          yield { 
            type: 'step.progress', 
            step: 'processPayment', 
            data: { amount: input.total, method: input.paymentMethod }
          };
          
          const payment = await paymentService.processPayment(input.total, input.paymentMethod);
          
          return {
            transactionId: payment.transactionId,
            status: payment.status,
            fee: payment.fee
          };
        };
      })
    );

    // Send notifications step (parallel email + SMS)
    const sendNotificationsStep = step(
      z.object({ 
        email: z.string(), 
        phone: z.string().optional(),
        orderId: z.string(),
        total: z.number()
      }),
      z.object({
        email: z.string().optional(),
        sms: z.string().optional()
      }),
      derive({ 
        emailService: emailServiceExecutor, 
        config: configExecutor 
      }, ({ emailService, config }) => {
        return async function*(input) {
          const flowId = `notifications-${Date.now()}`;
          const notifications: any = {};
          
          // Send email notification
          if (config.features.emailNotifications) {
            try {
              const emailResult = await emailService.sendEmail(
                input.email,
                'orderConfirmation',
                { orderId: input.orderId, amount: input.total }
              );
              notifications.email = emailResult.messageId;
              
              yield { 
                type: 'step.progress', 
                step: 'sendNotifications', 
                data: { email: 'sent', messageId: emailResult.messageId }
              };
            } catch (error) {
              yield { 
                type: 'step.progress', 
                step: 'sendNotifications', 
                data: { email: 'failed', error: (error as Error).message }
              };
            }
          }
          
          // Send SMS notification
          if (input.phone && config.features.smsNotifications) {
            try {
              const smsResult = await emailService.sendSMS(
                input.phone,
                `Order ${input.orderId} confirmed for $${input.total}`
              );
              notifications.sms = smsResult.messageId;
              
              yield { 
                type: 'step.progress', 
                step: 'sendNotifications', 
                data: { sms: 'sent', messageId: smsResult.messageId }
              };
            } catch (error) {
              yield { 
                type: 'step.progress', 
                step: 'sendNotifications', 
                data: { sms: 'failed', error: (error as Error).message }
              };
            }
          }
          
          return notifications;
        };
      })
    );

    // Complete order processing flow
    const orderProcessingFlow = flow(
      orderInputSchema,
      orderSchema,
      derive({
        calculateStep: calculateTotalStep,
        paymentStep: processPaymentStep,
        notificationStep: sendNotificationsStep
      }, ({ calculateStep, paymentStep, notificationStep }) => {
        return async function*(input, scope) {
          const orderId = `ORD-${Date.now()}`;
          const flowId = `order-${orderId}`;
          
          yield { type: 'flow.start', flowId };
          
          // Step 1: Calculate order total (now also uses yield* since all steps are generators)
          const totals = yield* calculateStep({ items: input.items });
          
          // Step 2: Process payment
          const payment = yield* paymentStep({ 
            total: totals.total, 
            paymentMethod: input.paymentMethod 
          });
          
          // Step 3: Send notifications
          const notifications = yield* notificationStep({
            email: input.email,
            phone: input.phone,
            orderId,
            total: totals.total
          });
          
          yield { type: 'flow.complete', flowId };
          
          return {
            orderId,
            userId: input.userId,
            total: totals.total,
            status: 'completed',
            paymentId: payment.transactionId,
            notifications
          };
        };
      })
    );

    it("should process order successfully", async () => {
      const result = await execute(orderProcessingFlow, {
        userId: "user123",
        items: [
          { id: "item1", name: "Widget", price: 19.99, quantity: 2 },
          { id: "item2", name: "Gadget", price: 29.99, quantity: 1 }
        ],
        paymentMethod: "credit-card",
        email: "customer@example.com",
        phone: "+1-555-0123"
      }, { parentScope: appScope });

      expect(result.result.orderId).toMatch(/^ORD-/);
      expect(result.result.total).toBe(69.97); // 19.99*2 + 29.99
      expect(result.result.status).toBe('completed');
      expect(result.result.paymentId).toMatch(/^txn-/);
      expect(result.result.notifications.email).toBeDefined();
      expect(result.result.notifications.sms).toBeDefined();
    });

    it("should handle payment failure", async () => {
      await expect(execute(orderProcessingFlow, {
        userId: "user123",
        items: [{ id: "item1", name: "Expensive Item", price: 15000, quantity: 1 }],
        paymentMethod: "credit-card",
        email: "customer@example.com"
      }, { parentScope: appScope })).rejects.toThrow("Amount exceeds limit");
    });

    it("should handle payment method failure", async () => {
      await expect(execute(orderProcessingFlow, {
        userId: "user123",
        items: [{ id: "item1", name: "Widget", price: 19.99, quantity: 1 }],
        paymentMethod: "invalid-card",
        email: "customer@example.com"
      }, { parentScope: appScope })).rejects.toThrow("Payment method declined");
    });

    it("should handle partial notification failures gracefully", async () => {
      const events: any[] = [];
      
      const result = await execute(orderProcessingFlow, {
        userId: "user123",
        items: [{ id: "item1", name: "Widget", price: 19.99, quantity: 1 }],
        paymentMethod: "credit-card",
        email: "bounce@example.com", // This will fail
        phone: "+1-555-0123"
      }, { 
        parentScope: appScope,
        onEvent: (event) => events.push(event)
      });

      // Order should still complete successfully
      expect(result.result.status).toBe('completed');
      
      // Should have notification events showing email failure
      const notificationEvents = events.filter(e => 
        e.step === 'sendNotifications' && e.type === 'flow.progress'
      );
      expect(notificationEvents.length).toBeGreaterThan(0);
      expect(result.result.status).toBe('completed');
    });
  });

  describe("Flow Scope Lifecycle", () => {
    it("should isolate flow scope from app scope", async () => {
      const testFlow = flow(
        z.object({ value: z.number() }),
        z.object({ result: z.number() }),
        provide(() => async function*(input, scope) {
          yield { type: 'flow.start', flowId: 'isolation-test' };
          
          // This should resolve from app scope
          const config = await scope.resolve(configExecutor);
          
          yield { type: 'flow.complete', flowId: 'isolation-test' };
          return { result: input.value * 10 };
        })
      );

      const result = await execute(testFlow, { value: 5 }, { parentScope: appScope });
      
      expect(result.result.result).toBe(50);
      // App scope should still be active after flow execution
      const appConfig = await appScope.resolve(configExecutor);
      expect(appConfig.features.emailNotifications).toBe(true);
    });

    it("should work without parent scope", async () => {
      const standaloneFlow = flow(
        z.object({ message: z.string() }),
        z.object({ processed: z.string() }),
        provide(() => async function*(input, scope) {
          yield { type: 'flow.start', flowId: 'standalone' };
          yield { type: 'flow.complete', flowId: 'standalone' };
          return { processed: `Processed: ${input.message}` };
        })
      );

      const result = await execute(standaloneFlow, { message: "test" });
      
      expect(result.result.processed).toBe("Processed: test");
      expect(result.events.length).toBeGreaterThanOrEqual(2); // Auto-generated flow events
    });
  });
});