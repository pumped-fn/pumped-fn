import { derive, name } from "@pumped-fn/core-next";
import { configController } from "./config";
import { renderer } from "./renderer";

export const inputHandler = derive([configController, renderer.static], ([ctrl, renderAccessor], ctl) => {
  const handleKey = (buffer: Buffer) => {
    const key = buffer.toString();

    switch (key) {
      case 'z':
        ctrl.cycleTimezone(-1);
        renderAccessor.get().render();
        break;
      case 'Z':
        ctrl.cycleTimezone(1);
        renderAccessor.get().render();
        break;
      case 'f':
        ctrl.cycleFormat(-1);
        renderAccessor.get().render();
        break;
      case 'F':
        ctrl.cycleFormat(1);
        renderAccessor.get().render();
        break;
      case 's':
        ctrl.cycleFrameStyle(-1);
        renderAccessor.get().render();
        break;
      case 'S':
        ctrl.cycleFrameStyle(1);
        renderAccessor.get().render();
        break;
      case 'h':
        ctrl.toggleHelp();
        renderAccessor.get().render();
        break;
      case 'q':
      case '\u0003':
        process.exit(0);
        break;
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', handleKey);

  ctl.cleanup(() => {
    process.stdin.removeListener('data', handleKey);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  });

  return { handleKey };
}, name("input-handler"));