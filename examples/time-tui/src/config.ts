import { provide, derive, name } from "@pumped-fn/core-next";

export interface AppConfig {
  timezoneIndex: number;
  formatIndex: number;
  frameStyleIndex: number;
  showHelp: boolean;
  updateInterval: number;
}

export const config = provide(() => ({
  timezoneIndex: 0,
  formatIndex: 0,
  frameStyleIndex: 0,
  showHelp: false,
  updateInterval: 1000
}), name("config"));

export const configController = derive(config.static, (accessor) => ({
  cycleTimezone: (direction: number = 1) => accessor.update(cfg => ({
    ...cfg,
    timezoneIndex: (cfg.timezoneIndex + direction + 10) % 10
  })),

  cycleFormat: (direction: number = 1) => accessor.update(cfg => ({
    ...cfg,
    formatIndex: (cfg.formatIndex + direction + 6) % 6
  })),

  cycleFrameStyle: (direction: number = 1) => accessor.update(cfg => ({
    ...cfg,
    frameStyleIndex: (cfg.frameStyleIndex + direction + 9) % 9
  })),

  toggleHelp: () => accessor.update(cfg => ({
    ...cfg,
    showHelp: !cfg.showHelp
  }))
}), name("config-controller"));