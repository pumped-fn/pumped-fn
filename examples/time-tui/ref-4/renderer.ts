import { derive, name } from '@pumped-fn/core-next';
import { displayFormatter } from './display.js';

export const renderer = derive([displayFormatter.static], ([displayAccessor], ctl) => {
  let lastOutput = '';
  let isInit = false;

  const render = () => {
    const currentDisplay = displayAccessor.get();
    const output = currentDisplay.lines.join('\n');

    if (output !== lastOutput) {
      if (!isInit) {
        process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
        isInit = true;
      }

      process.stdout.write('\x1b[H');

      const terminalHeight = process.stdout.rows || 24;
      const terminalWidth = process.stdout.columns || 80;

      const startRow = Math.max(0, Math.floor((terminalHeight - currentDisplay.height) / 2));
      const startCol = Math.max(0, Math.floor((terminalWidth - currentDisplay.width) / 2));

      for (let i = 0; i < terminalHeight; i++) {
        const lineIndex = i - startRow;
        if (lineIndex >= 0 && lineIndex < currentDisplay.lines.length) {
          const line = currentDisplay.lines[lineIndex];
          const centeredLine = ' '.repeat(startCol) + line;
          const paddedLine = centeredLine + ' '.repeat(Math.max(0, terminalWidth - centeredLine.length));
          process.stdout.write(paddedLine);
        } else {
          process.stdout.write(' '.repeat(terminalWidth));
        }
        if (i < terminalHeight - 1) {
          process.stdout.write('\n');
        }
      }

      lastOutput = output;
    }
  };

  ctl.cleanup(() => {
    process.stdout.write('\x1b[?25h');
    console.log('\nThanks for using the Time Display App!');
  });

  return { render };
}, name('renderer'));