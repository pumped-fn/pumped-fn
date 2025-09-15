import { derive, createScope, name } from '@pumped-fn/core-next';
import { gameLoop } from './game-loop.js';
import { inputHandler } from './input.js';
import { renderer } from './renderer.js';

// Main app coordinator
const app = derive(
  [gameLoop, inputHandler, renderer],
  ([loop, input, rendererInstance], ctl) => {
    const startup = () => {
      console.log('🐍 Welcome to Snake Game! 🐍\n');
      console.log('Controls:');
      console.log('  WASD or Arrow Keys - Move snake');
      console.log('  R - Restart game');
      console.log('  Q - Quit game');
      console.log('\nGet ready...\n');

      // Countdown with visual feedback
      let countdown = 3;
      const countdownInterval = setInterval(() => {
        if (countdown > 0) {
          process.stdout.write(`\r${countdown}... `);
          countdown--;
        } else {
          clearInterval(countdownInterval);
          process.stdout.write('\rGO! 🚀\n\n');

          // Start the game after a brief pause
          setTimeout(() => {
            input.setupInput();
            // Start game with render callback
            loop.startGame(() => {
              rendererInstance.render();
            });
          }, 500);
        }
      }, 1000);
    };

    const cleanup = () => {
      console.log('\nGame shutting down...');
    };

    ctl.cleanup(cleanup);

    return { startup };
  },
  name('app')
);

// Main function with proper lifecycle management
async function main() {
  const scope = createScope();

  try {
    // Resolve the app (renderer is included as dependency)
    const appInstance = await scope.resolve(app);

    // Setup signal handlers for graceful shutdown
    const handleTermination = async (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down...`);
      await scope.dispose();
      process.exit(0);
    };

    process.on('SIGINT', () => handleTermination('SIGINT'));
    process.on('SIGTERM', () => handleTermination('SIGTERM'));

    // Start the game
    appInstance.startup();

    // Keep the process alive
    await new Promise((resolve) => {
      process.once('exit', resolve);
    });

  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

// Entry point with error boundary
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});