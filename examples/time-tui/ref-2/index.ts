import { derive, createScope, name } from '@pumped-fn/core-next';
import { timeController } from './time.js';
import { configController } from './config.js';
import { inputController } from './input.js';
import { renderer } from './display.js';

const autoRenderer = derive(
  renderer.reactive,
  (display) => {
    display.render();
    return { rendered: true };
  },
  name('auto-renderer')
);

const app = derive(
  [renderer, configController, inputController, timeController],
  ([display, config, input], ctl) => {
    const quit = () => {
      console.log('\nShutting down gracefully...');
      process.exit(0);
    };

    input.registerQuitHandler(quit);
    input.registerTimezoneHandlers(
      () => config.cycleTimezone('forward'),
      () => config.cycleTimezone('backward')
    );
    input.registerFormatHandlers(
      () => config.cycleFormat('forward'),
      () => config.cycleFormat('backward')
    );
    input.registerFrameHandlers(
      () => config.cycleFrame('forward'),
      () => config.cycleFrame('backward')
    );
    input.registerHelpHandler(() => config.toggleHelp());

    ctl.cleanup(() => {
      display.clearScreen();
    });

    return {
      start: () => {
        display.render();
      },
      quit
    };
  },
  name('app')
);

async function main() {
  const scope = createScope();

  try {
    const appInstance = await scope.resolve(app);
    await scope.resolve(autoRenderer);

    setupSignalHandlers(scope, () => {
      console.log('\nShutting down...');
    });

    appInstance.start();

    await keepAlive();

  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

function setupSignalHandlers(scope: any, cleanup: () => void) {
  const handleTermination = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    cleanup();
    await scope.dispose();
    process.exit(0);
  };

  process.on('SIGINT', () => handleTermination('SIGINT'));
  process.on('SIGTERM', () => handleTermination('SIGTERM'));
  process.on('SIGHUP', () => handleTermination('SIGHUP'));
}

function keepAlive(): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {}, 60000);

    process.once('exit', () => {
      clearInterval(interval);
      resolve();
    });
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});