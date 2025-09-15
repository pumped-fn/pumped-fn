import { provide, derive, createScope, name, Core } from "@pumped-fn/core-next";

interface FrameStyle {
  name: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

const FRAME_STYLES: FrameStyle[] = [
  {
    name: "Classic Box",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
  },
  {
    name: "Double Line",
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
  },
  {
    name: "Rounded",
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
  },
  {
    name: "ASCII Simple",
    topLeft: "+",
    topRight: "+",
    bottomLeft: "+",
    bottomRight: "+",
    horizontal: "-",
    vertical: "|",
  },
  {
    name: "Stars",
    topLeft: "*",
    topRight: "*",
    bottomLeft: "*",
    bottomRight: "*",
    horizontal: "*",
    vertical: "*",
  },
  {
    name: "Dots",
    topLeft: "·",
    topRight: "·",
    bottomLeft: "·",
    bottomRight: "·",
    horizontal: "·",
    vertical: "·",
  },
  {
    name: "Heavy",
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
  },
  {
    name: "Dashed",
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "┄",
    vertical: "┆",
  },
  {
    name: "None",
    topLeft: " ",
    topRight: " ",
    bottomLeft: " ",
    bottomRight: " ",
    horizontal: " ",
    vertical: " ",
  },
];

interface TimeFormatter {
  name: string;
  format: (date: Date, timezone: string) => string;
}

const FORMATTERS: TimeFormatter[] = [
  {
    name: "24-hour",
    format: (date, timezone) =>
      date.toLocaleTimeString("en-US", {
        timeZone: timezone === "local" ? undefined : timezone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
  },
  {
    name: "12-hour",
    format: (date, timezone) =>
      date.toLocaleTimeString("en-US", {
        timeZone: timezone === "local" ? undefined : timezone,
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
  },
  {
    name: "ISO 8601",
    format: (date, timezone) => {
      if (timezone === "local") {
        return date.toISOString().slice(11, 19);
      }
      return new Intl.DateTimeFormat("sv-SE", {
        timeZone: timezone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
    },
  },
  {
    name: "Unix Timestamp",
    format: (date) => Math.floor(date.getTime() / 1000).toString(),
  },
  {
    name: "Full Date Time",
    format: (date, timezone) =>
      date.toLocaleString("en-US", {
        timeZone: timezone === "local" ? undefined : timezone,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
  },
  {
    name: "Milliseconds",
    format: (date, timezone) => {
      const timeStr = date.toLocaleTimeString("en-US", {
        timeZone: timezone === "local" ? undefined : timezone,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      const ms = date.getMilliseconds().toString().padStart(3, "0");
      return `${timeStr}.${ms}`;
    },
  },
];

const TIMEZONES = [
  { name: "Local", value: "local" },
  { name: "UTC", value: "UTC" },
  { name: "New York", value: "America/New_York" },
  { name: "Los Angeles", value: "America/Los_Angeles" },
  { name: "Chicago", value: "America/Chicago" },
  { name: "London", value: "Europe/London" },
  { name: "Paris", value: "Europe/Paris" },
  { name: "Tokyo", value: "Asia/Tokyo" },
  { name: "Sydney", value: "Australia/Sydney" },
  { name: "Mumbai", value: "Asia/Kolkata" },
];

const config = provide(
  () => ({
    updateInterval: 1000,
    selectedTimezone: 0,
    selectedFormatter: 0,
    selectedFrame: 1,
    showHelp: false,
  }),
  name("config")
);

const timeSource = provide(() => new Date(), name("time-source"));

const settingsController = derive(
  config.static,
  (configAccessor, ctl) => {
    const cycleTimezone = (direction: 1 | -1) => {
      configAccessor.update((cfg) => ({
        ...cfg,
        selectedTimezone:
          (cfg.selectedTimezone + direction + TIMEZONES.length) %
          TIMEZONES.length,
      }));
    };

    const cycleFormatter = (direction: 1 | -1) => {
      configAccessor.update((cfg) => ({
        ...cfg,
        selectedFormatter:
          (cfg.selectedFormatter + direction + FORMATTERS.length) %
          FORMATTERS.length,
      }));
    };

    const cycleFrame = (direction: 1 | -1) => {
      configAccessor.update((cfg) => ({
        ...cfg,
        selectedFrame:
          (cfg.selectedFrame + direction + FRAME_STYLES.length) %
          FRAME_STYLES.length,
      }));
    };

    const toggleHelp = () => {
      configAccessor.update((cfg) => ({ ...cfg, showHelp: !cfg.showHelp }));
    };

    return {
      cycleTimezone,
      cycleFormatter,
      cycleFrame,
      toggleHelp,
    };
  },
  name("settings-controller")
);

const timeController = derive(
  [config, timeSource.static],
  ([cfg, timeAccessor], ctl) => {
    let intervalId: NodeJS.Timeout | null = null;

    const start = () => {
      if (intervalId) return;

      intervalId = setInterval(() => {
        timeAccessor.update(new Date());
      }, cfg.updateInterval);
    };

    const stop = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const getCurrentTime = () => timeAccessor.get();

    ctl.cleanup(() => {
      stop();
    });

    start();

    return {
      start,
      stop,
      getCurrentTime,
    };
  },
  name("time-controller")
);

const timeDisplay = derive(
  [timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    const timezone = TIMEZONES[cfg.selectedTimezone];
    const formatter = FORMATTERS[cfg.selectedFormatter];
    const frame = FRAME_STYLES[cfg.selectedFrame];

    const formatted = formatter.format(time, timezone.value);

    return {
      current: time,
      formatted,
      timezoneName: timezone.name,
      formatterName: formatter.name,
      frameName: frame.name,
      showHelp: cfg.showHelp,
    };
  },
  name("time-display")
);

type TimeDisplay = Core.InferOutput<typeof timeDisplay>;

const inputHandler = derive(
  settingsController,
  (settings, ctl) => {
    const stdin = process.stdin;
    let isRawMode = false;

    const setupInput = () => {
      if (stdin.isTTY) {
        stdin.setRawMode(true);
        isRawMode = true;
      }
      stdin.setEncoding("utf8");
      stdin.resume();

      const handleKeypress = (key: string) => {
        switch (key.toLowerCase()) {
          case "z":
            settings.cycleTimezone(key === "z" ? 1 : -1);
            break;
          case "f":
            settings.cycleFormatter(key === "f" ? 1 : -1);
            break;
          case "s":
            settings.cycleFrame(key === "s" ? 1 : -1);
            break;
          case "h":
            settings.toggleHelp();
            break;
          case "q":
          case "\u0003": // Ctrl+C
            process.exit(0);
            break;
        }
      };

      stdin.on("data", handleKeypress);

      ctl.cleanup(() => {
        stdin.removeListener("data", handleKeypress);
        if (isRawMode && stdin.isTTY) {
          stdin.setRawMode(false);
        }
        stdin.pause();
      });
    };

    setupInput();

    return { setupInput };
  },
  name("input-handler")
);

const renderer = derive(
  config.reactive,
  (cfg) => {
    const createFrame = (lines: string[]) => {
      const frame = FRAME_STYLES[cfg.selectedFrame];

      if (frame.name === "None") {
        return lines.join("\n");
      }

      const maxWidth = Math.max(...lines.map((line) => line.length));
      const contentWidth = maxWidth + 4; // 2 spaces on each side
      const frameWidth = contentWidth + 2; // plus left and right borders

      const topLine =
        frame.topLeft +
        frame.horizontal.repeat(contentWidth) +
        frame.topRight;
      const bottomLine =
        frame.bottomLeft +
        frame.horizontal.repeat(contentWidth) +
4; // 2 spaces on each side
             frame.bottomRight;

      const framedLines = lines.map((line) => {
        const paddedLine = line.padEnd(maxWidth);
        return `${frame.vertical}  ${paddedLine}  ${frame.vertical}`;
      });

      return [topLine, ...framedLines, bottomLine].join("\n");
    };

    const render = (display: TimeDisplay) => {
      clear();

      const contentLines = [
        `Current Time: ${display.formatted}`,
        `Timezone: ${display.timezoneName}`,
        `Format: ${display.formatterName}`,
        `Frame: ${display.frameName}`,
      ];

      const framedContent = createFrame(contentLines);

      let output = framedContent;

      if (display.showHelp) {
        output += "\n\n";
        const helpLines = [
          "Keyboard Shortcuts",
          "[z/Z] Change timezone ±",
          "[f/F] Change format ±",
          "[s/S] Change frame style ±",
          "[h]   Hide this help",
          "[q]   Quit application",
        ];
        output += createFrame(helpLines);
      } else {
        output += "\n\nPress [h] for help • [q] to quit";
      }

      process.stdout.write(output);
    };

    const clear = () => {
      process.stdout.write("\x1b[2J\x1b[H"); // Clear screen and move cursor to top
    };

    const cleanup = () => {
      clear();
    };

    return {
      render,
      clear,
      cleanup,
    };
  },
  name("renderer")
);

const app = derive(
  [timeDisplay.reactive, renderer, timeController, inputHandler],
  ([display, render, controller, input]) => {
    render.render(display);

    return {
      display,
      render,
      controller,
      input,
    };
  },
  name("app")
);

function setupSignalHandlers(scope: Core.Scope, cleanup: () => void) {
  const handleTermination = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down gracefully...`);
    cleanup();
    await scope.dispose();
    console.log("Time TUI terminated.");
    process.exit(0);
  };

  process.on("SIGHUP", () => handleTermination("SIGHUP"));
  process.on("SIGINT", () => handleTermination("SIGINT"));
  process.on("SIGTERM", () => handleTermination("SIGTERM"));
}

function keepAlive(): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {}, 60000);

    process.once("exit", () => {
      clearInterval(interval);
      resolve();
    });
  });
}

async function main() {
  // 1. Create scope for the application
  const scope = createScope();

  try {
    // 2. Resolve only what you need at startup
    const appInstance = await scope.resolve(app);
    const rendererInstance = await scope.resolve(renderer);

    // 3. Setup external handlers with scope reference
    setupSignalHandlers(scope, rendererInstance.cleanup);

    // 4. Initialize UI
    console.log("\x1b[2J\x1b[H"); // Clear screen
    console.log("Enhanced Time TUI started!");
    console.log("Press [h] for help, [q] to quit\n");

    // 5. Keep application running
    await keepAlive();
  } catch (error) {
    // 6. Error handling with proper cleanup
    console.error("Error running enhanced time TUI:", error);
    await scope.dispose();
    process.exit(1);
  }
}

// 7. Simple main invocation with error boundary
main();
