import { provide, derive, name } from '@pumped-fn/core-next';

export const TIMEZONES = [
  'Local',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Asia/Kolkata'
] as const;

export const TIME_FORMATS = [
  '24-hour',
  '12-hour',
  'ISO 8601',
  'Unix Timestamp',
  'Full DateTime',
  'Milliseconds'
] as const;

export const FRAME_STYLES = [
  'Classic Box',
  'Double Line',
  'Rounded',
  'ASCII Simple',
  'Stars',
  'Dots',
  'Heavy',
  'Dashed',
  'None'
] as const;

export type TimezoneType = typeof TIMEZONES[number];
export type TimeFormatType = typeof TIME_FORMATS[number];
export type FrameStyleType = typeof FRAME_STYLES[number];

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
} as AppConfig), name('config'));

export const configController = derive(config.static, (accessor) => ({
  cycleTimezone: (forward: boolean = true) =>
    accessor.update(c => ({
      ...c,
      timezoneIndex: forward
        ? (c.timezoneIndex + 1) % TIMEZONES.length
        : (c.timezoneIndex - 1 + TIMEZONES.length) % TIMEZONES.length
    })),

  cycleFormat: (forward: boolean = true) =>
    accessor.update(c => ({
      ...c,
      formatIndex: forward
        ? (c.formatIndex + 1) % TIME_FORMATS.length
        : (c.formatIndex - 1 + TIME_FORMATS.length) % TIME_FORMATS.length
    })),

  cycleFrameStyle: (forward: boolean = true) =>
    accessor.update(c => ({
      ...c,
      frameStyleIndex: forward
        ? (c.frameStyleIndex + 1) % FRAME_STYLES.length
        : (c.frameStyleIndex - 1 + FRAME_STYLES.length) % FRAME_STYLES.length
    })),

  toggleHelp: () =>
    accessor.update(c => ({ ...c, showHelp: !c.showHelp }))
}), name('config-controller'));