import { createScope, provide, derive, createCancellationExtension, Promised } from "@pumped-fn/core-next";

const cancellationExt = createCancellationExtension();
const appScope = createScope({
  extensions: [cancellationExt],
});

const dbConnection = provide((controller) => {
  console.log("Opening database connection");

  controller.signal?.addEventListener("abort", () => {
    console.log("Closing database connection");
  });

  controller.cleanup(() => {
    console.log("Cleanup: database connection");
  });

  return { query: (sql: string) => console.log("Query:", sql) };
});

const requestHandler = derive(dbConnection, (db, controller) => {
  if (controller.signal?.aborted) {
    return { status: 503, body: "Service shutting down" };
  }

  db.query("SELECT * FROM users");

  return { status: 200, body: "OK" };
});

async function handleRequest() {
  const result = await appScope.resolve(requestHandler).toPromise();
  console.log("Response:", result);
}

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, initiating graceful shutdown");

  cancellationExt.controller.abort("SIGTERM");

  setTimeout(async () => {
    await appScope.dispose().toPromise();
    console.log("Shutdown complete");
    process.exit(0);
  }, 5000);
});

handleRequest();

setTimeout(() => {
  console.log("\nSimulating shutdown...");
  process.emit("SIGTERM" as any);
}, 1000);
