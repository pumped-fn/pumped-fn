import { provide, derive, name } from '@pumped-fn/core-next';

export const inputHandler = provide(() => {
  const handlers: Map<string, () => void> = new Map();

  const setup = () => {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (key: string) => {
      const cleanKey = key.trim();
      const handler = handlers.get(cleanKey) || handlers.get(key);
      if (handler) {
        handler();
      }
    });
  };

  const cleanup = () => {
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  };

  const registerHandler = (key: string, handler: () => void) => {
    handlers.set(key, handler);
  };

  const removeHandler = (key: string) => {
    handlers.delete(key);
  };

  return {
    setup,
    cleanup,
    registerHandler,
    removeHandler
  };
}, name('input-handler'));

export const inputController = derive(
  inputHandler,
  (handler, ctl) => {
    handler.setup();

    ctl.cleanup(() => {
      handler.cleanup();
    });

    const registerQuitHandler = (quitCallback: () => void) => {
      handler.registerHandler('q', quitCallback);
      handler.registerHandler('\u0003', quitCallback); // Ctrl+C
    };

    const registerTimezoneHandlers = (
      forwardHandler: () => void,
      backwardHandler: () => void
    ) => {
      handler.registerHandler('z', forwardHandler);
      handler.registerHandler('Z', backwardHandler);
    };

    const registerFormatHandlers = (
      forwardHandler: () => void,
      backwardHandler: () => void
    ) => {
      handler.registerHandler('f', forwardHandler);
      handler.registerHandler('F', backwardHandler);
    };

    const registerFrameHandlers = (
      forwardHandler: () => void,
      backwardHandler: () => void
    ) => {
      handler.registerHandler('s', forwardHandler);
      handler.registerHandler('S', backwardHandler);
    };

    const registerHelpHandler = (helpHandler: () => void) => {
      handler.registerHandler('h', helpHandler);
    };

    return {
      registerQuitHandler,
      registerTimezoneHandlers,
      registerFormatHandlers,
      registerFrameHandlers,
      registerHelpHandler
    };
  },
  name('input-controller')
);