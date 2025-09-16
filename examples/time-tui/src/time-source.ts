import { provide, derive, name } from "@pumped-fn/core-next";

export const TIMEZONES = [
  { key: "local", name: "Local", tz: undefined },
  { key: "utc", name: "UTC", tz: "UTC" },
  { key: "eastern", name: "Eastern", tz: "America/New_York" },
  { key: "pacific", name: "Pacific", tz: "America/Los_Angeles" },
  { key: "central", name: "Central", tz: "America/Chicago" },
  { key: "london", name: "London", tz: "Europe/London" },
  { key: "paris", name: "Paris", tz: "Europe/Paris" },
  { key: "tokyo", name: "Tokyo", tz: "Asia/Tokyo" },
  { key: "sydney", name: "Sydney", tz: "Australia/Sydney" },
  { key: "kolkata", name: "Kolkata", tz: "Asia/Kolkata" }
] as const;

export const TIME_FORMATS = [
  { key: "24hour", name: "24-hour", format: (date: Date, tz?: string) =>
    date.toLocaleTimeString("en-GB", { hour12: false, timeZone: tz }) },
  { key: "12hour", name: "12-hour", format: (date: Date, tz?: string) =>
    date.toLocaleTimeString("en-US", { hour12: true, timeZone: tz }) },
  { key: "iso", name: "ISO 8601", format: (date: Date, tz?: string) => {
    const d = tz ? new Date(date.toLocaleString("en-US", { timeZone: tz })) : date;
    return d.toISOString().split('T')[1].split('.')[0];
  }},
  { key: "unix", name: "Unix Timestamp", format: (date: Date) =>
    Math.floor(date.getTime() / 1000).toString() },
  { key: "full", name: "Full Date Time", format: (date: Date, tz?: string) =>
    date.toLocaleString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: tz
    }) },
  { key: "milliseconds", name: "Milliseconds", format: (date: Date, tz?: string) => {
    const base = date.toLocaleTimeString("en-GB", { hour12: false, timeZone: tz });
    return `${base}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  }}
] as const;

export const timeSource = provide(() => new Date(), name("time-source"));