import { provide, derive, name } from '@pumped-fn/core-next';
import { config, TIMEZONES, TIME_FORMATS, type TimezoneType, type TimeFormatType } from './config.js';

export interface TimeData {
  currentTime: Date;
  timezone: TimezoneType;
  format: TimeFormatType;
  formattedTime: string;
}

export const timeSource = provide(() => ({
  currentTime: new Date()
}), name('time-source'));

export const timeController = derive(timeSource.static, (timeAccessor, ctl) => {
  let interval: NodeJS.Timeout | null = null;

  const start = () => {
    interval = setInterval(() => {
      timeAccessor.update({ currentTime: new Date() });
    }, 1000);
  };

  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };

  ctl.cleanup(() => {
    stop();
  });

  return { start, stop };
}, name('time-controller'));

function formatTime(date: Date, timezone: TimezoneType, format: TimeFormatType): string {
  const getDateInTimezone = (date: Date, tz: TimezoneType): Date => {
    if (tz === 'Local') return date;
    if (tz === 'UTC') return new Date(date.toISOString());

    try {
      return new Date(date.toLocaleString('en-US', { timeZone: tz }));
    } catch {
      return date;
    }
  };

  const targetDate = getDateInTimezone(date, timezone);

  switch (format) {
    case '24-hour':
      return targetDate.toLocaleTimeString('en-GB', {
        hour12: false,
        timeZone: timezone === 'Local' ? undefined : timezone === 'UTC' ? 'UTC' : timezone
      });

    case '12-hour':
      return targetDate.toLocaleTimeString('en-US', {
        hour12: true,
        timeZone: timezone === 'Local' ? undefined : timezone === 'UTC' ? 'UTC' : timezone
      });

    case 'ISO 8601':
      const tzDate = timezone === 'UTC'
        ? new Date(date.getTime())
        : timezone === 'Local'
        ? date
        : new Date(date.toLocaleString('en-US', { timeZone: timezone }));

      return tzDate.toTimeString().split(' ')[0];

    case 'Unix Timestamp':
      return Math.floor(date.getTime() / 1000).toString();

    case 'Full DateTime':
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: timezone === 'Local' ? undefined : timezone === 'UTC' ? 'UTC' : timezone
      };
      return targetDate.toLocaleDateString('en-US', options);

    case 'Milliseconds':
      const ms = targetDate.getMilliseconds().toString().padStart(3, '0');
      const timeStr = targetDate.toLocaleTimeString('en-GB', {
        hour12: false,
        timeZone: timezone === 'Local' ? undefined : timezone === 'UTC' ? 'UTC' : timezone
      });
      return `${timeStr}.${ms}`;

    default:
      return targetDate.toLocaleTimeString();
  }
}

export const timeDisplay = derive([timeSource.reactive, config.reactive], ([time, cfg]) => {
  const timezone = TIMEZONES[cfg.timezoneIndex];
  const format = TIME_FORMATS[cfg.formatIndex];

  return {
    currentTime: time.currentTime,
    timezone,
    format,
    formattedTime: formatTime(time.currentTime, timezone, format)
  } as TimeData;
}, name('time-display'));