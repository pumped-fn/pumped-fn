import { provide, derive, createScope, meta, custom, name } from "@pumped-fn/core-next";

/**
 * Meta Example - Service Documentation and Configuration
 *
 * Shows meta-based decoration for configuration and documentation
 */

// #region snippet
// Define meta types
const serviceName = meta("service-name", custom<string>());
const version = meta("version", custom<string>());
const tags = meta("tags", custom<string[]>());
const docs = meta("documentation", custom<{
  description: string;
  examples?: string[];
  since?: string;
}>());

// Configuration meta
const httpConfig = meta("http-config", custom<{
  baseUrl: string;
  timeout: number;
  retries: number;
}>());

// Well-documented components with meta
const database = provide(() => ({
  query: async (sql: string) => [{ id: 1, name: "John" }],
  insert: async (table: string, data: any) => ({ id: 1, ...data })
}),
  serviceName("database"),
  version("2.1.0"),
  tags(["persistence", "sql", "critical"]),
  docs({
    description: "Primary database connection with query and insert capabilities",
    examples: [
      "await db.query('SELECT * FROM users')",
      "await db.insert('users', { name: 'John' })"
    ],
    since: "1.0.0"
  })
);

const httpClient = provide((ctl) => {
  const config = httpConfig.get(ctl.scope);

  return {
    get: async (path: string) => {
      return fetch(`${config.baseUrl}${path}`, {
        signal: AbortSignal.timeout(config.timeout)
      });
    },
    post: async (path: string, data: any) => {
      return fetch(`${config.baseUrl}${path}`, {
        method: 'POST',
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(config.timeout)
      });
    }
  };
},
  serviceName("http-client"),
  version("1.3.0"),
  tags(["http", "client", "api"]),
  docs({
    description: "HTTP client with configurable base URL and timeout",
    examples: [
      "await http.get('/users')",
      "await http.post('/users', { name: 'John' })"
    ],
    since: "1.0.0"
  })
);

const userService = derive(
  [database, httpClient],
  ([db, http]) => ({
    async getUser(id: string) {
      const users = await db.query(`SELECT * FROM users WHERE id = ${id}`);
      return users[0];
    },

    async syncUserFromApi(id: string) {
      const response = await http.get(`/users/${id}`);
      const userData = await response.json();
      return db.insert('users', userData);
    }
  }),
  serviceName("user-service"),
  version("1.0.0"),
  tags(["business", "users", "api-integration"]),
  docs({
    description: "User management service with database and API integration",
    examples: [
      "await userService.getUser('123')",
      "await userService.syncUserFromApi('456')"
    ],
    since: "1.0.0"
  })
);

// Introspection utilities
function inspectComponent(executor: any) {
  const name = serviceName.find(executor) || "unknown";
  const ver = version.find(executor) || "0.0.0";
  const componentTags = tags.find(executor) || [];
  const documentation = docs.find(executor);

  console.log(`\n=== ${name} v${ver} ===`);
  console.log(`Tags: ${componentTags.join(", ")}`);

  if (documentation) {
    console.log(`Description: ${documentation.description}`);
    if (documentation.examples) {
      console.log("Examples:");
      documentation.examples.forEach(ex => console.log(`  ${ex}`));
    }
    if (documentation.since) {
      console.log(`Available since: ${documentation.since}`);
    }
  }
}

function findComponentsByTag(components: any[], targetTag: string) {
  return components.filter(component => {
    const componentTags = tags.find(component) || [];
    return componentTags.includes(targetTag);
  });
}

async function main() {
  // Configure HTTP client through scope meta
  const scope = createScope({
    meta: [httpConfig({
      baseUrl: "https://jsonplaceholder.typicode.com",
      timeout: 5000,
      retries: 3
    })]
  });

  console.log("=== Component Documentation ===");

  // Inspect all components
  const components = [database, httpClient, userService];
  components.forEach(inspectComponent);

  console.log("\n=== Components by Tag ===");
  const apiComponents = findComponentsByTag(components, "api");
  console.log("API-related components:", apiComponents.map(c => serviceName.find(c)).join(", "));

  const criticalComponents = findComponentsByTag(components, "critical");
  console.log("Critical components:", criticalComponents.map(c => serviceName.find(c)).join(", "));

  console.log("\n=== Using Components ===");
  const service = await scope.resolve(userService);

  try {
    const user = await service.getUser("1");
    console.log("Local user:", user);

    const syncedUser = await service.syncUserFromApi("1");
    console.log("Synced user:", syncedUser);
  } catch (error) {
    console.error("Error:", error.message);
  }

  await scope.dispose();
}
// #endregion snippet

main().catch(console.error);