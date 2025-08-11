import { provide, derive, createScope } from "@pumped-fn/core-next";

/**
 * Pretty advanced example to expose API surfaces
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
  translation: {
    poll: 5000,
    source: "https://example.com/translations",
  },
}));

const logger = derive(config, (config) => {
  /** logger implementation */
});

const connection = derive([logger, config], ([logger, config]) => {
  /** connection implementation */
});

const translationsLoader = derive(
  [logger, config],
  ([logger, config]) =>
    async () => {
      /** translation loader implementation */
    }
);

const translations = derive(
  [translationsLoader],
  async ([translationsLoader]) => {
    return await translationsLoader();
  }
);

const translationUpdator = derive(
  [logger, config, translationsLoader, translations.static],
  ([logger, config, loader, translations], ctl) => {
    /** translation updator implementation */
    const interval = setInterval(async () => {
      // sample code only, don't use for production please
      const newTranslations = await loader();
      translations.update(newTranslations);
    }, config.translation.poll);

    ctl.cleanup(() => {
      interval && clearInterval(interval);
    });
  }
);

const healthcheckRoute = derive(
  [logger, connection],
  ([logger, connection]) => {
    /** healthcheck route implementation */
  }
);

const translationRoute = derive([translations.static], ([translations]) => {
  translations.get(); // retrieve the latest
});

const server = derive(
  [logger, config, healthcheckRoute, translationRoute],
  ([logger, config, healthcheckRoute, translationRoute]) => ({
    /** server implementation */
    start: () => {
      // register routes ...
      console.log(
        `Server running at http://${config.server.host}:${config.server.port}`
      );
      // Start server logic...
    },
  })
);

const scope = createScope();

await scope.resolve(translationUpdator); // Start the translation updater
const resolvedServer = await scope.resolve(server);
resolvedServer.start(); // Start the server

await scope.dispose(); // Cleanup resources, release memory
