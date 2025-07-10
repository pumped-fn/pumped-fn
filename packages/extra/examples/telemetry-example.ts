import { provide, derive, createScope } from "@pumped-fn/core-next";
import { telemetry } from "../src/telemetry";

// Example: Basic telemetry setup
async function basicExample() {
  console.log("\n=== Basic Telemetry Example ===");
  
  // Create a telemetry middleware with console output
  const telemetryMiddleware = telemetry.middleware({
    adapter: telemetry.console({ pretty: true }),
  });

  // Create a scope and add the telemetry middleware
  const scope = createScope();
  scope.use(telemetryMiddleware);

  // Create a service with telemetry metadata
  const mathService = provide(() => ({
    add: (a: number, b: number) => {
      console.log(`Computing ${a} + ${b}`);
      return a + b;
    },
    multiply: (a: number, b: number) => {
      console.log(`Computing ${a} * ${b}`);
      return a * b;
    },
    divide: (a: number, b: number) => {
      if (b === 0) throw new Error("Division by zero");
      return a / b;
    },
  }), telemetry.meta({
    name: "MathService",
    category: "computation",
    customAttributes: {
      version: "1.0.0",
      team: "backend",
    },
  }));

  // Resolve and use the service
  const math = await scope.resolve(mathService);
  
  // These calls will be tracked by telemetry
  const sum = math.add(5, 3);
  const product = math.multiply(4, 7);
  
  // This will capture an error
  try {
    math.divide(10, 0);
  } catch (error) {
    console.log("Caught expected error:", error instanceof Error ? error.message : String(error));
  }

  await scope.dispose();
}

// Example: Advanced telemetry with privacy and sampling
async function advancedExample() {
  console.log("\n=== Advanced Telemetry Example ===");
  
  const telemetryMiddleware = telemetry.middleware({
    adapter: telemetry.console({ pretty: true }),
    sampling: {
      rate: 0.5, // Only sample 50% of operations
      strategy: "random",
    },
    privacy: {
      redactParameters: ["password", "apiKey", "token"],
      redactResults: ["secret", "credential"],
    },
    performance: {
      maxSpanDuration: 100, // Flag operations taking longer than 100ms
    },
  });

  const scope = createScope();
  scope.use(telemetryMiddleware);

  // Authentication service with sensitive data
  const authService = provide(() => ({
    login: async (username: string, password: string) => {
      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        userId: "123",
        token: "jwt-token-here",
        username,
      };
    },
    createApiKey: (name: string, permissions: string[]) => ({
      name,
      apiKey: "sk_live_secret_key",
      permissions,
    }),
  }), telemetry.meta({
    name: "AuthService",
    category: "security",
    sensitive: true,
  }));

  const auth = await scope.resolve(authService);
  
  // Parameters with "password" will be redacted
  const loginResult = await auth.login("john.doe", "super-secret-password");
  console.log("Login result:", loginResult);
  
  // Result with "apiKey" will be redacted
  const apiKeyResult = auth.createApiKey("production", ["read", "write"]);
  console.log("API Key result:", apiKeyResult);

  await scope.dispose();
}

// Example: Dependency tracking with nested spans
async function dependencyExample() {
  const telemetryMiddleware = telemetry.middleware({
    adapter: telemetry.console({ pretty: true }),
  });

  const scope = createScope();
  scope.use(telemetryMiddleware);

  // Database service
  const dbService = provide(() => ({
    findUser: async (id: string) => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { id, name: "John Doe", email: "john@example.com" };
    },
    findPosts: async (userId: string) => {
      await new Promise(resolve => setTimeout(resolve, 30));
      return [
        { id: "1", title: "First Post", userId },
        { id: "2", title: "Second Post", userId },
      ];
    },
  }), telemetry.meta({ name: "DatabaseService", category: "data" }));

  // API service that depends on database
  const apiService = derive([dbService], ([db]) => ({
    getUserProfile: async (userId: string) => {
      // These nested calls will create child spans
      const user = await db.findUser(userId);
      const posts = await db.findPosts(userId);
      
      return {
        user,
        posts,
        postCount: posts.length,
      };
    },
  }), telemetry.meta({ name: "APIService", category: "api" }));

  const api = await scope.resolve(apiService);
  
  // This will create nested spans showing the dependency chain
  const profile = await api.getUserProfile("user-123");

  await scope.dispose();
}

// Example: Skipping telemetry for specific executors
async function skipTelemetryExample() {
  const telemetryMiddleware = telemetry.middleware({
    adapter: telemetry.console({ pretty: true }),
  });

  const scope = createScope();
  scope.use(telemetryMiddleware);

  // Public service - tracked
  const publicService = provide(() => ({
    getPublicData: () => ({ status: "ok", data: [1, 2, 3] }),
  }), telemetry.meta({ name: "PublicService" }));

  // Internal service - not tracked
  const internalService = provide(() => ({
    getInternalMetrics: () => ({ cpu: 45, memory: 78 }),
  }), telemetry.meta({ 
    name: "InternalService",
    skipTelemetry: true, // This executor won't be tracked
  }));

  const publicApi = await scope.resolve(publicService);
  const internalApi = await scope.resolve(internalService);
  
  await scope.dispose();
}

// Run all examples
async function runExamples() {
  // await basicExample();
  // await advancedExample();
  await dependencyExample();
  await skipTelemetryExample();
}

// Run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}