import { provide, derive, createScope } from "@pumped-fn/core-next";

/**
 * A little bit more advanced to expose API surfaces
 *
 * We have more value containers, more complicated dependencies
 * ... we have scope
 * ... and nothing changes, we can resolve things so easily still
 */

const config = provide(() => ({
  server: {
    port: 3000,
    host: "localhost",
  },
  db: {
    uri: "mongodb://localhost:27017/mydb",
  },
  logger: {
    defaultLevel: "info",
    transport: "console",
  },
}));

const logger = derive(config, (config) => {
  /** logger implementation */
});

const connection = derive({ logger, config }, ({ logger, config }) => {
  /** connection implementation */
});

const healthcheckRoute = derive(
  [logger, connection],
  ([logger, connection]) => {
    /** healthcheck route implementation */
  }
);

const server = derive(
  [logger, config, healthcheckRoute],
  ([logger, config, healthcheckRoute]) => ({
    /** server implementation */
    start: () => {
      console.log(
        `Server running at http://${config.server.host}:${config.server.port}`
      );
      // Start server logic...
    },
  })
);

const scope = createScope();

const resolvedServer = await scope.resolve(server);
resolvedServer.start(); // Start the server

await scope.dispose(); // Cleanup resources, release memory
