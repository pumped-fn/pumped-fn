import { derive, createScope, name } from "@pumped-fn/core-next";
import { timer } from "./timer";
import { inputHandler } from "./input";
import { renderer } from "./renderer";

const app = derive([timer, inputHandler, renderer], ([timerCtrl, input, display]) => ({
  ...timerCtrl,
  ...input,
  display
}), name("app"));

async function main() {
  const scope = createScope();

  try {
    await scope.resolve(app);

    process.on('SIGINT', async () => {
      await scope.dispose();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await scope.dispose();
      process.exit(0);
    });

    process.on('SIGHUP', async () => {
      await scope.dispose();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);