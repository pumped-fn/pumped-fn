import { flow, custom, provide, FlowError } from "@pumped-fn/core-next";
import { z } from "zod";

const database = provide(() => ({
  findUser: async (email: string) => null as { id: string; email: string } | null,
  createUser: async (data: { email: string; name: string; hashedPassword: string }) =>
    ({ id: "123", ...data })
}));

const emailService = provide(() => ({
  sendWelcome: async (email: string) => console.log(`Welcome email sent to ${email}`)
}));

const registerFlow = flow.define({
  name: "user.register",
  input: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    password: z.string().min(8)
  }),
  output: z.object({
    userId: z.string(),
    created: z.boolean()
  })
});

const validateEmail = flow(
  { db: database },
  async ({ db }, ctx, input: { email: string }) => {
    const existing = await ctx.run("check-email", () => db.findUser(input.email));

    if (existing) {
      throw new FlowError("Email already registered", "EMAIL_EXISTS");
    }

    return { valid: true };
  }
);

const registerHandler = registerFlow.handler(
  { db: database, email: emailService },
  async ({ db, email }, ctx, input) => {
    await ctx.exec(validateEmail, { email: input.email });

    const user = await ctx.run("create-user", () =>
      db.createUser({
        email: input.email,
        name: input.name,
        hashedPassword: hashPassword(input.password)
      })
    );

    email.sendWelcome(input.email).catch(console.error);

    return {
      userId: user.id,
      created: true
    };
  }
);

async function main() {
  try {
    const result = await flow.execute(registerHandler, {
      email: "user@example.com",
      name: "John Doe",
      password: "securepassword123"
    });

    console.log("User created:", result.userId);
  } catch (error) {
    console.error("Registration failed:", error);
  }
}

function hashPassword(password: string): string {
  return `hashed_${password}`;
}

main().catch(console.error);