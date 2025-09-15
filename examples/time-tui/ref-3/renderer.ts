import { derive, name } from '@pumped-fn/core-next';
import { config, gameState } from './game-state.js';
import type { Position, GameState } from './types.js';

// Display renderer with reactive updates
const display = derive(
  [config, gameState.reactive],
  ([cfg, state]) => {
    const createFrame = (): string[][] => {
      const frame: string[][] = Array(cfg.height).fill(null).map(() => Array(cfg.width).fill(' '));

      // Place food first
      if (state.food.x >= 0 && state.food.x < cfg.width && state.food.y >= 0 && state.food.y < cfg.height) {
        frame[state.food.y][state.food.x] = '*';
      }

      // Place snake (snake overrides food if they're in same position)
      state.snake.forEach((segment, index) => {
        if (segment.x >= 0 && segment.x < cfg.width && segment.y >= 0 && segment.y < cfg.height) {
          frame[segment.y][segment.x] = index === 0 ? '@' : 'o';
        }
      });

      return frame;
    };

    const render = (): string => {
      const frame = createFrame();

      // Build the display line by line with fixed borders
      let output = '';

      // Top border
      output += '┌' + '─'.repeat(cfg.width) + '┐\n';

      // Game area with side borders
      frame.forEach(row => {
        const rowStr = row.join('');
        output += `│${rowStr}│\n`;
      });

      // Bottom border
      output += '└' + '─'.repeat(cfg.width) + '┘\n';

      // Game info
      output += `Score: ${state.score} | Speed: ${state.speed}ms`;

      if (state.gameOver) {
        output += `\n\n🎮 GAME OVER! 🎮\nFinal Score: ${state.score}\nPress 'r' to restart or 'q' to quit`;
      } else {
        output += `\n\nUse WASD or arrow keys to move | 'r' to restart | 'q' to quit`;
      }

      return output;
    };

    return { render, frame: createFrame() };
  },
  name('display')
);

// Terminal renderer with fresh state access
const renderer = derive(
  [config, gameState.static],
  ([cfg, stateAccessor], ctl) => {
    let isScreenInitialized = false;
    let lastOutput = '';
    let cleanupExecuted = false;

    const initScreen = () => {
      if (!isScreenInitialized) {
        // Hide cursor, clear screen, and position cursor
        process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
        isScreenInitialized = true;
      }
    };

    const performRender = () => {
      // Get fresh state each time
      const currentState = stateAccessor.get();

      // Create frame dynamically with current state
      const frame: string[][] = Array(cfg.height).fill(null).map(() => Array(cfg.width).fill(' '));

      // Place food first
      if (currentState.food.x >= 0 && currentState.food.x < cfg.width && currentState.food.y >= 0 && currentState.food.y < cfg.height) {
        frame[currentState.food.y][currentState.food.x] = '*';
      }

      // Place snake (snake overrides food if they're in same position)
      currentState.snake.forEach((segment, index) => {
        if (segment.x >= 0 && segment.x < cfg.width && segment.y >= 0 && segment.y < cfg.height) {
          frame[segment.y][segment.x] = index === 0 ? '@' : 'o';
        }
      });

      // Build the display line by line with fixed borders
      let output = '';

      // Top border
      output += '┌' + '─'.repeat(cfg.width) + '┐\n';

      // Game area with side borders
      frame.forEach(row => {
        const rowStr = row.join('');
        output += `│${rowStr}│\n`;
      });

      // Bottom border
      output += '└' + '─'.repeat(cfg.width) + '┘\n';

      // Game info
      output += `Score: ${currentState.score} | Speed: ${currentState.speed}ms`;

      if (currentState.gameOver) {
        output += `\n\n🎮 GAME OVER! 🎮\nFinal Score: ${currentState.score}\nPress 'r' to restart or 'q' to quit`;
      } else {
        output += `\n\nUse WASD or arrow keys to move | 'r' to restart | 'q' to quit`;
      }

      if (output !== lastOutput) {
        initScreen();

        // Move to top and overwrite with current content
        process.stdout.write('\x1b[H');
        process.stdout.write(output);

        lastOutput = output;
      }
    };

    const cleanup = () => {
      if (!cleanupExecuted) {
        // Restore cursor and clear
        process.stdout.write('\x1b[?25h\x1b[2J\x1b[H');
        console.log('Thanks for playing Snake! 🐍');
        cleanupExecuted = true;
      }
    };

    ctl.cleanup(cleanup);

    return { render: performRender, cleanup };
  },
  name('renderer')
);

export { display, renderer };