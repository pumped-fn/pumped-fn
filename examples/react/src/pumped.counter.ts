import { provide, derive, custom, meta } from "@pumped-fn/core-next";

const name = meta("name", custom<string>());

const config = provide(
  () => ({
    increment: 1,
    interval: 500,
  }),
  name("config")
);

const configController = derive(
  config.static,
  (configCtl) => {
    return {
      changeIncrement: (increment: number) =>
        configCtl.update((config) => ({
          ...config,
          increment: config.increment + increment,
        })),
      changeInterval: (interval: number) =>
        configCtl.update((config) => ({
          ...config,
          interval: config.interval + interval * 100,
        })),
    };
  },
  name("configCtl")
);

const counter = provide(() => 0, name("timer"));

const timer = derive(
  [config.reactive, counter.static],
  ([config, counterCtl], ctl) => {
    console.log("config updated", config);

    const interval = setInterval(() => {
      counterCtl.update((value) => value + config.increment);
    }, config.interval);

    ctl.cleanup(() => {
      clearInterval(interval);
    });
  },
  name("timer")
);

export const counterApp = {
  config,
  configController,
  counter,
  timer,
};
