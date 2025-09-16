import { provide, derive, createScope, name } from "@pumped-fn/core-next";

// Time management system
const timeSource = provide(() => new Date(), name("time-source"));

// Configuration state
const config = provide(
  () => ({
    timezoneIndex: 0,
    formatIndex: 0,
    frameIndex: 0,
    showHelp: false,
  }),
  name("config")
);

// Time management with timezone support
const timeManager = derive(
  [timeSource.reactive, config.reactive],
  ([currentTime, cfg]) => {
    const timezones = [
      "Local",
      "UTC",
      "America/New_York",
      "America/Los_Angeles",
      "America/Chicago",
      "Europe/London",
      "Europe/Paris",
      "Asia/Tokyo",
      "Australia/Sydney",
      "Asia/Kolkata",
    ];

    const formats = [
      "24-hour",
      "12-hour",
      "ISO 8601",
      "Unix Timestamp",
      "Full DateTime",
      "Milliseconds",
    ];

    const selectedTimezone = timezones[cfg.timezoneIndex];
    const selectedFormat = formats[cfg.formatIndex];

    let displayTime: Date;
    if (selectedTimezone === "Local") {
      displayTime = currentTime;
    } else if (selectedTimezone === "UTC") {
      displayTime = new Date(currentTime.toISOString());
    } else {
      displayTime = new Date(
        currentTime.toLocaleString("en-US", { timeZone: selectedTimezone })
      );
    }

    let formattedTime: string;
    switch (cfg.formatIndex) {
      case 0: // 24-hour
        formattedTime = displayTime.toLocaleTimeString("en-GB", {
          hour12: false,
        });
        break;
      case 1: // 12-hour
        formattedTime = displayTime.toLocaleTimeString("en-US", {
          hour12: true,
        });
        break;
      case 2: // ISO 8601
        formattedTime = displayTime.toTimeString().split(" ")[0];
        break;
      case 3: // Unix Timestamp
        formattedTime = Math.floor(displayTime.getTime() / 1000).toString();
        break;
      case 4: // Full DateTime
        formattedTime =
          displayTime.toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          }) +
          " " +
          displayTime.toLocaleTimeString("en-GB", { hour12: false });
        break;
      case 5: // Milliseconds
        formattedTime =
          displayTime.toTimeString().split(" ")[0] +
          "." +
          displayTime.getMilliseconds().toString().padStart(3, "0");
        break;
      default:
        formattedTime = displayTime.toLocaleTimeString();
    }

    return {
      time: formattedTime,
      timezone: selectedTimezone,
      format: selectedFormat,
      timezones,
      formats,
    };
  },
  name("time-manager")
);

// Configuration controller
const configController = derive(
  config.static,
  (accessor) => ({
    cycleTimezone: (direction: 1 | -1) => {
      accessor.update((cfg) => {
        const newIndex = (cfg.timezoneIndex + direction + 10) % 10;
        return { ...cfg, timezoneIndex: newIndex };
      });
    },
    cycleFormat: (direction: 1 | -1) => {
      accessor.update((cfg) => {
        const newIndex = (cfg.formatIndex + direction + 6) % 6;
        return { ...cfg, formatIndex: newIndex };
      });
    },
    cycleFrame: (direction: 1 | -1) => {
      accessor.update((cfg) => {
        const newIndex = (cfg.frameIndex + direction + 9) % 9;
        return { ...cfg, frameIndex: newIndex };
      });
    },
    toggleHelp: () => {
      accessor.update((cfg) => ({ ...cfg, showHelp: !cfg.showHelp }));
    },
  }),
  name("config-controller")
);

// Display renderer
const display = derive(
  [timeManager.reactive, config.reactive],
  ([timeData, cfg]) => {
    const frameStyles = [
      { name: "Classic Box", chars: ["┌", "─", "┐", "│", "└", "─", "┘", "│"] },
      { name: "Double Line", chars: ["╔", "═", "╗", "║", "╚", "═", "╝", "║"] },
      { name: "Rounded", chars: ["╭", "─", "╮", "│", "╰", "─", "╯", "│"] },
      { name: "ASCII Simple", chars: ["+", "-", "+", "|", "+", "-", "+", "|"] },
      { name: "Stars", chars: ["*", "*", "*", "*", "*", "*", "*", "*"] },
      { name: "Dots", chars: ["·", "·", "·", "·", "·", "·", "·", "·"] },
      { name: "Heavy", chars: ["┏", "━", "┓", "┃", "┗", "━", "┛", "┃"] },
      { name: "Dashed", chars: ["┌", "┄", "┐", "┆", "└", "┄", "┘", "┆"] },
      { name: "None", chars: ["", "", "", "", "", "", "", ""] },
    ];

    const selectedFrame = frameStyles[cfg.frameIndex];

    const content = [
      `Time: ${timeData.time}`,
      `Timezone: ${timeData.timezone}`,
      `Format: ${timeData.format}`,
      `Frame: ${selectedFrame.name}`,
    ];

    const helpText = [
      "Keyboard Controls:",
      "z/Z - Cycle timezone forward/backward",
      "f/F - Cycle format forward/backward",
      "s/S - Cycle frame style forward/backward",
      "h - Toggle help",
      "q - Quit",
    ];

    const displayContent = cfg.showHelp
      ? [...content, "", ...helpText]
      : content;
    const maxWidth = Math.max(...displayContent.map((line) => line.length)) + 4;

    let output = "";

    if (selectedFrame.name !== "None") {
      const [tl, t, tr, r, bl, b, br, l] = selectedFrame.chars;

      // Top border
      output += tl + t.repeat(maxWidth - 2) + tr + "\n";

      // Content lines
      for (const line of displayContent) {
        const padding = Math.floor((maxWidth - 2 - line.length) / 2);
        const paddedLine =
          " ".repeat(padding) +
          line +
          " ".repeat(maxWidth - 2 - padding - line.length);
        output += l + paddedLine + r + "\n";
      }

      // Bottom border
      output += bl + b.repeat(maxWidth - 2) + br;
    } else {
      output = displayContent.join("\n");
    }

    return {
      rendered: output,
      frameName: selectedFrame.name,
    };
  },
  name("display")
);

// Keyboard input handler
const inputHandler = derive(
  [configController],
  ([ctrl], ctl) => {
    const stdin = process.stdin;

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const handleKeyPress = (key: string) => {
      switch (key) {
        case "z":
          ctrl.cycleTimezone(1);
          break;
        case "Z":
          ctrl.cycleTimezone(-1);
          break;
        case "f":
          ctrl.cycleFormat(1);
          break;
        case "F":
          ctrl.cycleFormat(-1);
          break;
        case "s":
          ctrl.cycleFrame(1);
          break;
        case "S":
          ctrl.cycleFrame(-1);
          break;
        case "h":
          ctrl.toggleHelp();
          break;
        case "q":
        case "\u0003": // Ctrl+C
          process.exit(0);
          break;
      }
    };

    stdin.on("data", handleKeyPress);

    ctl.cleanup(() => {
      stdin.removeListener("data", handleKeyPress);
      stdin.setRawMode(false);
      stdin.pause();
    });

    return { handleKeyPress };
  },
  name("input-handler")
);

// Renderer with flicker-free updates
const renderer = derive(
  [display.static],
  ([displayAccessor], ctl) => {
    let lastOutput = "";
    let isInit = false;

    const render = () => {
      const current = displayAccessor.get(); // Always fresh
      const output = current.rendered;

      if (output !== lastOutput) {
        if (!isInit) {
          process.stdout.write("\x1b[?25l\x1b[2J\x1b[H"); // Hide cursor, clear screen, home
          isInit = true;
        } else {
          process.stdout.write("\x1b[H"); // Just move cursor to home
        }
        process.stdout.write(output);
        lastOutput = output;
      }
    };

    ctl.cleanup(() => {
      process.stdout.write("\x1b[?25h"); // Show cursor
      console.log("\n\nThanks for using the time display!");
    });

    return { render };
  },
  name("renderer")
);

// Timer system
const timer = derive(
  [timeSource.static, renderer.static],
  ([timeAccessor, renderAccessor], ctl) => {
    const tick = () => {
      timeAccessor.update(new Date());      // Update source
      renderAccessor.get().render();        // Render fresh
    };

    // Initial render
    tick();

    const interval = setInterval(tick, 1000);

    ctl.cleanup(() => {
      clearInterval(interval);
    });

    return { tick };
  },
  name("timer")
);

// Main application
const app = derive(
  [timer, inputHandler],
  ([timerCtrl, input]) => {
    console.log("Terminal Time Display Started!");
    console.log('Press "h" for help, "q" to quit');

    // Setup graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    return {
      ...timerCtrl,
      ...input,
    };
  },
  name("app")
);

// Main function
async function main() {
  const scope = createScope();

  try {
    await scope.resolve(app);
  } catch (error) {
    console.error("Error:", error);
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);
