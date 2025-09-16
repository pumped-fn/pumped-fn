import { derive, name } from "@pumped-fn/core-next";
import { display } from "./display";

export const renderer = derive([display.static], ([displayAccessor], ctl) => {
  let lastOutput = "";
  let isInit = false;

  const render = () => {
    const current = displayAccessor.get();
    const output = current.rendered;

    if (output !== lastOutput) {
      if (!isInit) {
        process.stdout.write('\x1b[?25l\x1b[2J\x1b[H');
        isInit = true;
      } else {
        process.stdout.write('\x1b[H');
      }
      process.stdout.write(output);
      lastOutput = output;
    }
  };

  ctl.cleanup(() => {
    process.stdout.write('\x1b[?25h');
    console.log("\n\nThanks for using Time TUI!");
  });

  return { render };
}, name("renderer"));