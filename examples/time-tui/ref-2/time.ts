import { provide, derive, name } from '@pumped-fn/core-next';

export const TIMEZONES = [
  { name: 'Local', timezone: undefined },
  { name: 'UTC', timezone: 'UTC' },
  { name: 'New York', timezone: 'America/New_York' },
  { name: 'Los Angeles', timezone: 'America/Los_Angeles' },
  { name: 'Chicago', timezone: 'America/Chicago' },
  { name: 'London', timezone: 'Europe/London' },
  { name: 'Paris', timezone: 'Europe/Paris' },
  { name: 'Tokyo', timezone: 'Asia/Tokyo' },
  { name: 'Sydney', timezone: 'Australia/Sydney' },
  { name: 'Kolkata', timezone: 'Asia/Kolkata' }
] as const;

export const TIME_FORMATS = [
  { name: '24-hour', format: (date: Date) => date.toLocaleTimeString('en-US', { hour12: false, timeZone: undefined }) },
  { name: '12-hour', format: (date: Date) => date.toLocaleTimeString('en-US', { hour12: true, timeZone: undefined }) },
  { name: 'ISO 8601', format: (date: Date) => date.toISOString().split('T')[1].split('.')[0] },
  { name: 'Unix Timestamp', format: (date: Date) => Math.floor(date.getTime() / 1000).toString() },
  { name: 'Full Date Time', format: (date: Date) => date.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: undefined }) },
  { name: 'Milliseconds', format: (date: Date) => date.toLocaleTimeString('en-US', { hour12: false, timeZone: undefined }) + '.' + date.getMilliseconds().toString().padStart(3, '0') }
] as const;

export const timeSource = provide(() => new Date(), name('time-source'));

export const timeController = derive(
  timeSource.static,
  (accessor, ctl) => {
    const intervalId = setInterval(() => {
      accessor.update(new Date());
    }, 1000);

    ctl.cleanup(() => {
      clearInterval(intervalId);
    });

    return {
      start: () => {},
      stop: () => clearInterval(intervalId)
    };
  },
  name('time-controller')
);

export const currentTime = derive(
  timeSource.reactive,
  (time) => time,
  name('current-time')
);