import { flow, custom, derive, provide, createScope } from "@pumped-fn/core-next";
import { z } from "zod";

/**
 * Flow Example - User Registration System
 *
 * Shows flow patterns with validation, dependencies, and error handling
 */

// #region snippet
// Dependencies
const database = provide(() => ({
  findUser: async (email: string) => null,
  createUser: async (data: any) => ({ id: "123", ...data })
}));

const emailService = provide(() => ({
  sendWelcome: async (email: string) => console.log(`Welcome email sent to ${email}`)
}));

// Input/output schemas with runtime validation
const registerFlow = flow.define({
  name: "user.register",
  input: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    password: z.string().min(8)
  }),
  success: z.object({
    userId: z.string(),
    created: z.boolean()
  }),
  error: z.object({
    code: z.string(),
    message: z.string()
  })
});

// Validation flow (internal)
const validateEmail = flow(
  {
    name: "internal.validateEmail",
    input: custom<{ email: string }>(),
    success: custom<{ valid: boolean }>(),
    error: custom<{ reason: string }>()
  },
  { db: database },
  async ({ db }, ctx, input) => {
    const existing = await db.findUser(input.email);
    if (existing) {
      return ctx.ko({ reason: "Email already registered" });
    }
    return ctx.ok({ valid: true });
  }
);

// Main registration handler with dependencies
const registerHandler = registerFlow.handler(
  { db: database, email: emailService },
  async ({ db, email }, ctx, input) => {
    // Validate email availability
    const validation = await ctx.execute(validateEmail, { email: input.email });

    if (validation.isKo()) {
      return ctx.ko({
        code: "VALIDATION_FAILED",
        message: validation.data.reason
      });
    }

    try {
      // Create user
      const user = await db.createUser({
        email: input.email,
        name: input.name,
        hashedPassword: hashPassword(input.password)
      });

      // Send welcome email (fire and forget)
      email.sendWelcome(input.email).catch(console.error);

      return ctx.ok({
        userId: user.id,
        created: true
      });
    } catch (error) {
      return ctx.ko({
        code: "CREATION_FAILED",
        message: "Failed to create user account"
      });
    }
  }
);

// Usage
async function main() {
  const result = await flow.execute(registerHandler, {
    email: "user@example.com",
    name: "John Doe",
    password: "securepassword123"
  });

  if (result.isOk()) {
    console.log("User created:", result.data.userId);
  } else {
    console.error("Registration failed:", result.data.message);
  }
}

function hashPassword(password: string): string {
  return `hashed_${password}`;
}
// #endregion snippet

main().catch(console.error);