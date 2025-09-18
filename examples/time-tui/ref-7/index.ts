import { provide, derive, createScope, name } from "@pumped-fn/core-next";

namespace TimeApp {
  export interface TimeConfig {
    formatIndex: number;
    timezoneIndex: number;
    frameStyleIndex: number;
    showHelp: boolean;
    updateInterval: number;
  }

  export interface TimeDisplay {
    timeText: string;
    formatName: string;
    timezoneName: string;
    frameStyleName: string;
    helpText: string[];
    renderedOutput: string[];
  }

  export interface FrameStyle {
    name: string;
    topLeft: string;
    topRight: string;
    bottomLeft: string;
    bottomRight: string;
    horizontal: string;
    vertical: string;
  }
}

const timeSource = provide(() => new Date(), name("time-source"));

const config = provide((): TimeApp.TimeConfig => ({
  formatIndex: 0,
  timezoneIndex: 0,
  frameStyleIndex: 0,
  showHelp: false,
  updateInterval: 1000,
}), name("config"));

const timeFormats = [
  { name: "24-hour", formatter: (date: Date, timezone: string) =>
    date.toLocaleTimeString("en-GB", { hour12: false, timeZone: timezone }) },
  { name: "12-hour", formatter: (date: Date, timezone: string) =>
    date.toLocaleTimeString("en-US", { hour12: true, timeZone: timezone }) },
  { name: "ISO 8601", formatter: (date: Date, timezone: string) =>
    new Date(date.toLocaleString("sv-SE", { timeZone: timezone })).toISOString().split("T")[1].split(".")[0] },
  { name: "Unix Timestamp", formatter: (date: Date) =>
    Math.floor(date.getTime() / 1000).toString() },
  { name: "Full Date Time", formatter: (date: Date, timezone: string) =>
    date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: timezone
    }) },
  { name: "Milliseconds", formatter: (date: Date, timezone: string) =>
    date.toLocaleTimeString("en-GB", { hour12: false, timeZone: timezone }) + "." +
    date.getMilliseconds().toString().padStart(3, "0") },
];

const timezones = [
  { name: "Local", value: Intl.DateTimeFormat().resolvedOptions().timeZone },
  { name: "UTC", value: "UTC" },
  { name: "America/New_York", value: "America/New_York" },
  { name: "America/Los_Angeles", value: "America/Los_Angeles" },
  { name: "America/Chicago", value: "America/Chicago" },
  { name: "Europe/London", value: "Europe/London" },
  { name: "Europe/Paris", value: "Europe/Paris" },
  { name: "Asia/Tokyo", value: "Asia/Tokyo" },
  { name: "Australia/Sydney", value: "Australia/Sydney" },
  { name: "Asia/Kolkata", value: "Asia/Kolkata" },
];

const frameStyles: TimeApp.FrameStyle[] = [
  { name: "Classic Box", topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" },
  { name: "Double Line", topLeft: "╔", topRight: "╗", bottomLeft: "╚", bottomRight: "╝", horizontal: "═", vertical: "║" },
  { name: "Rounded", topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" },
  { name: "ASCII Simple", topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" },
  { name: "Stars", topLeft: "*", topRight: "*", bottomLeft: "*", bottomRight: "*", horizontal: "*", vertical: "*" },
  { name: "Dots", topLeft: "·", topRight: "·", bottomLeft: "·", bottomRight: "·", horizontal: "·", vertical: "·" },
  { name: "Heavy", topLeft: "┏", topRight: "┓", bottomLeft: "┗", bottomRight: "┛", horizontal: "━", vertical: "┃" },
  { name: "Dashed", topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "┄", vertical: "┆" },
  { name: "None", topLeft: "", topRight: "", bottomLeft: "", bottomRight: "", horizontal: "", vertical: "" },
];

const configController = derive(
  config.static,
  (accessor) => ({
    cycleFormat: (direction: 1 | -1 = 1) =>
      accessor.update((cfg) => ({
        ...cfg,
        formatIndex: (cfg.formatIndex + direction + timeFormats.length) % timeFormats.length,
      })),
    cycleTimezone: (direction: 1 | -1 = 1) =>
      accessor.update((cfg) => ({
        ...cfg,
        timezoneIndex: (cfg.timezoneIndex + direction + timezones.length) % timezones.length,
      })),
    cycleFrameStyle: (direction: 1 | -1 = 1) =>
      accessor.update((cfg) => ({
        ...cfg,
        frameStyleIndex: (cfg.frameStyleIndex + direction + frameStyles.length) % frameStyles.length,
      })),
    toggleHelp: () =>
      accessor.update((cfg) => ({
        ...cfg,
        showHelp: !cfg.showHelp,
      })),
  }),
  name("config-controller")
);

const display = derive(
  [timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    const format = timeFormats[cfg.formatIndex];
    const timezone = timezones[cfg.timezoneIndex];
    const frameStyle = frameStyles[cfg.frameStyleIndex];

    const timeText = format.formatter(time, timezone.value);

    const helpText = cfg.showHelp ? [
      "Controls:",
      "f/F - cycle time format forward/backward",
      "z/Z - cycle timezone forward/backward",
      "s/S - cycle frame style forward/backward",
      "h - toggle help",
      "q - quit",
    ] : [];

    const content = [
      `Time: ${timeText}`,
      `Format: ${format.name}`,
      `Timezone: ${timezone.name}`,
      `Frame: ${frameStyle.name}`,
      ...helpText,
    ];

    const maxWidth = Math.max(...content.map(line => line.length));
    const renderedOutput: string[] = [];

    if (frameStyle.name !== "None") {
      renderedOutput.push(
        frameStyle.topLeft + frameStyle.horizontal.repeat(maxWidth + 2) + frameStyle.topRight
      );

      content.forEach(line => {
        const padding = maxWidth - line.length;
        renderedOutput.push(
          frameStyle.vertical + " " + line + " ".repeat(padding) + " " + frameStyle.vertical
        );
      });

      renderedOutput.push(
        frameStyle.bottomLeft + frameStyle.horizontal.repeat(maxWidth + 2) + frameStyle.bottomRight
      );
    } else {
      renderedOutput.push(...content);
    }

    return {
      timeText,
      formatName: format.name,
      timezoneName: timezone.name,
      frameStyleName: frameStyle.name,
      helpText,
      renderedOutput,
    } satisfies TimeApp.TimeDisplay;
  },
  name("display")
);

const renderer = derive(
  [display.static],
  ([displayAccessor], ctl) => {
    let lastOutput: string[] = [];
    let isDisposed = false;

    const render = () => {
      if (isDisposed) return;

      const displayData = displayAccessor.get();
      if (JSON.stringify(displayData.renderedOutput) !== JSON.stringify(lastOutput)) {
        process.stdout.write("\x1b[H\x1b[J");

        const terminalHeight = process.stdout.rows || 24;
        const terminalWidth = process.stdout.columns || 80;
        const contentHeight = displayData.renderedOutput.length;

        const startRow = Math.max(1, Math.floor((terminalHeight - contentHeight) / 2));

        displayData.renderedOutput.forEach((line, index) => {
          const row = startRow + index;
          const col = Math.max(1, Math.floor((terminalWidth - line.length) / 2));
          process.stdout.write(`\x1b[${row};${col}H${line}`);
        });

        lastOutput = [...displayData.renderedOutput];
      }
    };

    const subscription = displayAccessor.subscribe(render);
    render();

    ctl.cleanup(() => {
      isDisposed = true;
      subscription.dispose();
      process.stdout.write("\x1b[?25h\n");
      console.log("Thanks!");
    });

    return { render };
  },
  name("renderer")
);

const inputHandler = derive(
  [configController],
  ([ctrl], ctl) => {
    const handleKey = (chunk: Buffer) => {
      const key = chunk.toString();

      switch (key) {
        case "f":
          ctrl.cycleFormat(1);
          break;
        case "F":
          ctrl.cycleFormat(-1);
          break;
        case "z":
          ctrl.cycleTimezone(1);
          break;
        case "Z":
          ctrl.cycleTimezone(-1);
          break;
        case "s":
          ctrl.cycleFrameStyle(1);
          break;
        case "S":
          ctrl.cycleFrameStyle(-1);
          break;
        case "h":
          ctrl.toggleHelp();
          break;
        case "q":
        case "\u0003":
          process.exit(0);
          break;
      }
    };

    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", handleKey);

    ctl.cleanup(() => {
      process.stdin.removeListener("data", handleKey);
      process.stdin.setRawMode?.(false);
    });

    return { handleKey };
  },
  name("input-handler")
);

const timer = derive(
  [timeSource.static, config.reactive],
  ([timeAccessor, cfg], ctl) => {
    const tick = () => {
      timeAccessor.update(new Date());
    };

    process.stdout.write("\x1b[?25l");
    tick();

    const interval = setInterval(tick, cfg.updateInterval);
    ctl.cleanup(() => clearInterval(interval));

    return { tick };
  },
  name("timer")
);

const app = derive(
  [timer, inputHandler, renderer],
  ([timerCtrl, input, display]) => ({
    ...timerCtrl,
    ...input,
    display,
  }),
  name("app")
);

async function main() {
  const scope = createScope();

  const cleanup = () => {
    scope.dispose().then(() => {
      process.exit(0);
    }).catch(() => {
      process.exit(1);
    });
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("SIGHUP", cleanup);

  try {
    await scope.resolve(app);
  } catch (error) {
    console.error("Error:", error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);