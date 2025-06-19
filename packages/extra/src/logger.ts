export type Logger = {
  info: (message: unknown, ...args: any[]) => void;
  warn: (message: unknown, ...args: any[]) => void;
  error: (message: unknown, ...args: any[]) => void;
  debug: (message: unknown, ...args: any[]) => void;
};
