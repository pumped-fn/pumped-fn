import { resolves, createScope } from "@pumped-fn/core-next";
import { config, logger, connection, userSvc } from "./shared";
import { Hono } from "hono";

const scope = createScope();

async function main() {
  // please don't use this code snippet for production, it's just a sample

  const resolved = await resolves(scope, {
    config,
    logger,
    connection,
    userSvc,
  });

  resolved.logger(/** use logger */);

  const hono = new Hono();
  hono.get("/", (c) => {
    /** use whatever resolved using closure */
  });

  /** setup hono server to listen to port etc */
}

main()
  .then(() => console.log("Integration example completed successfully"))
  .catch((error) => console.error("Error in integration example:", error))
  .finally(() => {
    scope.dispose();
  });
