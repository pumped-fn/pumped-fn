import { createScope } from '@pumped-fn/core-next';
import { app } from './app.js';

async function main() {
  const scope = createScope();

  try {
    const timeApp = await scope.resolve(app);

    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await scope.dispose();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down...');
      await scope.dispose();
      process.exit(0);
    });

    process.on('SIGHUP', async () => {
      console.log('\nShutting down...');
      await scope.dispose();
      process.exit(0);
    });

    timeApp.startup();

  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);