import { derive, name } from '@pumped-fn/core-next';
import { timeController } from './time-source.js';
import { inputHandler } from './input.js';
import { renderer } from './renderer.js';

export const app = derive([timeController, inputHandler, renderer], ([timer, input, display], ctl) => {
  let renderInterval: NodeJS.Timeout | null = null;

  const startup = () => {
    input.setupInput();
    timer.start();

    display.render();

    renderInterval = setInterval(() => {
      display.render();
    }, 100);
  };

  ctl.cleanup(() => {
    if (renderInterval) {
      clearInterval(renderInterval);
    }
    timer.stop();
    input.teardownInput();
  });

  return {
    startup
  };
}, name('app'));