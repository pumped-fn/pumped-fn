import { describe, test, expect } from "vitest";
import { multi, custom, createScope, provide } from "../src";

describe("Multi Executor", () => {
  test("multi.provide creates key-based executor pool that resolves different values per key", async () => {
    const dbConnection = multi.provide(
      { keySchema: custom<string>() },
      (dbName) => ({ connection: `${dbName}-pool` })
    );

    const scope = createScope();
    const usersDb = dbConnection("users");
    const ordersDb = dbConnection("orders");

    const usersResult = await scope.resolve(usersDb);
    const ordersResult = await scope.resolve(ordersDb);

    expect(usersResult).toEqual({ connection: "users-pool" });
    expect(ordersResult).toEqual({ connection: "orders-pool" });
  });

  test("multi.derive creates key-based executor pool with dependencies", async () => {
    const config = provide(() => ({ baseUrl: "https://api.example.com" }));
    const apiClient = multi.derive(
      { keySchema: custom<string>(), dependencies: { config } },
      ({ config }, serviceName) => ({
        endpoint: `${config.baseUrl}/${serviceName}`,
      })
    );

    const scope = createScope();
    const usersApi = apiClient("users");
    const ordersApi = apiClient("orders");

    const usersResult = await scope.resolve(usersApi);
    const ordersResult = await scope.resolve(ordersApi);

    expect(usersResult).toEqual({ endpoint: "https://api.example.com/users" });
    expect(ordersResult).toEqual({
      endpoint: "https://api.example.com/orders",
    });
  });
});
