import { derive, name } from '@pumped-fn/core-next';
import { gameController } from './game-logic.js';
import type { Direction } from './types.js';

// Input handler
const inputHandler = derive(
  gameController,
  (controller, ctl) => {
    const keyMap: Record<string, Direction> = {
      'w': 'up',
      'W': 'up',
      's': 'down',
      'S': 'down',
      'a': 'left',
      'A': 'left',
      'd': 'right',
      'D': 'right',
      '\u001b[A': 'up',    // Arrow up
      '\u001b[B': 'down',  // Arrow down
      '\u001b[C': 'right', // Arrow right
      '\u001b[D': 'left'   // Arrow left
    };

    const handleKeypress = (str: string, key: any) => {
      if (!str) return;

      // Handle quit
      if (str === 'q' || str === 'Q' || (key && key.ctrl && key.name === 'c')) {
        process.exit(0);
      }

      // Handle restart
      if (str === 'r' || str === 'R') {
        controller.reset();
        return;
      }

      // Handle direction changes
      const direction = keyMap[str];
      if (direction) {
        controller.changeDirection(direction);
      }
    };

    const setupInput = () => {
      // Enable raw mode to capture individual keypresses
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      process.stdin.on('keypress', handleKeypress);
      process.stdin.on('data', (key) => {
        handleKeypress(key.toString(), null);
      });
    };

    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeAllListeners('keypress');
      process.stdin.removeAllListeners('data');
    };

    ctl.cleanup(cleanup);

    return { setupInput, cleanup };
  },
  name('input-handler')
);

export { inputHandler };