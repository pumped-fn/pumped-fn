import { derive, name } from '@pumped-fn/core-next';
import { configController } from './config.js';

export interface InputHandler {
  setupInput: () => void;
  teardownInput: () => void;
}

export const inputHandler = derive([configController], ([ctrl], ctl) => {
  let isRawMode = false;

  const handleKeypress = (key: Buffer) => {
    const char = key.toString();

    switch (char) {
      case 'z':
        ctrl.cycleTimezone(true);
        break;
      case 'Z':
        ctrl.cycleTimezone(false);
        break;
      case 'f':
        ctrl.cycleFormat(true);
        break;
      case 'F':
        ctrl.cycleFormat(false);
        break;
      case 's':
        ctrl.cycleFrameStyle(true);
        break;
      case 'S':
        ctrl.cycleFrameStyle(false);
        break;
      case 'h':
        ctrl.toggleHelp();
        break;
      case 'q':
      case '\u0003': // Ctrl+C
        process.exit(0);
        break;
    }
  };

  const setupInput = () => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      isRawMode = true;
    }
    process.stdin.resume();
    process.stdin.on('data', handleKeypress);
  };

  const teardownInput = () => {
    process.stdin.removeListener('data', handleKeypress);
    process.stdin.pause();
    if (process.stdin.isTTY && isRawMode) {
      process.stdin.setRawMode(false);
      isRawMode = false;
    }
  };

  ctl.cleanup(() => {
    teardownInput();
  });

  return {
    setupInput,
    teardownInput
  };
}, name('input-handler'));