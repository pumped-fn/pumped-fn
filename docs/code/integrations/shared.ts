import { provide, derive } from "@pumped-fn/core-next";

export const config = provide(() => ({
  //         ^^^^^
  server: {
    port: 3000,
    host: "localhost",
  },
  logger: {
    defaultLevel: "info",
    transport: "console",
  },
}));

export const logger = derive(config, (config) => {
  //                                  ^^^^^^
  /** logger implementation */
  return (message: string) => {
    console.log(`[${config.logger.defaultLevel}] ${message}`);
  };
});

export const connection = derive({ logger, config }, ({ logger, config }) => {
  //                                                    ^^^^^^  ^^^^^^
  /** connection implementation */
});

export const userSvc = derive([logger, connection], ([logger, connection]) => ({
  /** service implementation */
}));
