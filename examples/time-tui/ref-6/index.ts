import { provide, derive, createScope, name } from "@pumped-fn/core-next";

// Timezone definitions
const TIMEZONES = [
  { name: "Local", value: undefined },
  { name: "UTC", value: "UTC" },
  { name: "America/New_York", value: "America/New_York" },
  { name: "America/Los_Angeles", value: "America/Los_Angeles" },
  { name: "America/Chicago", value: "America/Chicago" },
  { name: "Europe/London", value: "Europe/London" },
  { name: "Europe/Paris", value: "Europe/Paris" },
  { name: "Asia/Tokyo", value: "Asia/Tokyo" },
  { name: "Australia/Sydney", value: "Australia/Sydney" },
  { name: "Asia/Kolkata", value: "Asia/Kolkata" }
] as const;

// Time format definitions
const TIME_FORMATS = [
  { name: "24-hour", format: (date: Date) => date.toLocaleTimeString("en-GB", { hour12: false, timeZone: getCurrentTimezone() }) },
  { name: "12-hour", format: (date: Date) => date.toLocaleTimeString("en-US", { hour12: true, timeZone: getCurrentTimezone() }) },
  { name: "ISO 8601", format: (date: Date) => new Date(date.toLocaleString("en-US", { timeZone: getCurrentTimezone() })).toTimeString().split(' ')[0] },
  { name: "Unix Timestamp", format: (date: Date) => Math.floor(date.getTime() / 1000).toString() },
  { name: "Full Date Time", format: (date: Date) => date.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: getCurrentTimezone() }) + " " + date.toLocaleTimeString("en-US", { hour12: false, timeZone: getCurrentTimezone() }) },
  { name: "Milliseconds", format: (date: Date) => new Date(date.toLocaleString("en-US", { timeZone: getCurrentTimezone() })).toTimeString().split(' ')[0] + "." + date.getMilliseconds().toString().padStart(3, '0') }
] as const;

// Frame style definitions
const FRAME_STYLES = [
  { name: "Classic Box", chars: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" } },
  { name: "Double Line", chars: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" } },
  { name: "Rounded", chars: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" } },
  { name: "ASCII Simple", chars: { tl: "+", tr: "+", bl: "+", br: "+", h: "-", v: "|" } },
  { name: "Stars", chars: { tl: "*", tr: "*", bl: "*", br: "*", h: "*", v: "*" } },
  { name: "Dots", chars: { tl: "·", tr: "·", bl: "·", br: "·", h: "·", v: "·" } },
  { name: "Heavy", chars: { tl: "┏", tr: "┓", bl: "┗", br: "┛", h: "━", v: "┃" } },
  { name: "Dashed", chars: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "┄", v: "┆" } },
  { name: "None", chars: null }
] as const;

let currentTimezoneIndex = 0;

function getCurrentTimezone() {
  return TIMEZONES[currentTimezoneIndex]?.value;
}

// 1. Time source (programmatic updates)
const timeSource = provide(() => new Date(), name("time-source"));

// 2. Config state
const config = provide(() => ({
  timezoneIndex: 0,
  formatIndex: 0,
  frameIndex: 0,
  showHelp: false
}), name("config"));

// 3. Config controller
const configController = derive(config.static, (accessor) => ({
  cycleTimezoneForward: () => accessor.update(cfg => ({
    ...cfg,
    timezoneIndex: (cfg.timezoneIndex + 1) % TIMEZONES.length
  })),
  cycleTimezoneBackward: () => accessor.update(cfg => ({
    ...cfg,
    timezoneIndex: (cfg.timezoneIndex - 1 + TIMEZONES.length) % TIMEZONES.length
  })),
  cycleFormatForward: () => accessor.update(cfg => ({
    ...cfg,
    formatIndex: (cfg.formatIndex + 1) % TIME_FORMATS.length
  })),
  cycleFormatBackward: () => accessor.update(cfg => ({
    ...cfg,
    formatIndex: (cfg.formatIndex - 1 + TIME_FORMATS.length) % TIME_FORMATS.length
  })),
  cycleFrameForward: () => accessor.update(cfg => ({
    ...cfg,
    frameIndex: (cfg.frameIndex + 1) % FRAME_STYLES.length
  })),
  cycleFrameBackward: () => accessor.update(cfg => ({
    ...cfg,
    frameIndex: (cfg.frameIndex - 1 + FRAME_STYLES.length) % FRAME_STYLES.length
  })),
  toggleHelp: () => accessor.update(cfg => ({
    ...cfg,
    showHelp: !cfg.showHelp
  }))
}), name("config-controller"));

// 4. Time display (pure transformation)
const display = derive([timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    currentTimezoneIndex = cfg.timezoneIndex;

    const timezone = TIMEZONES[cfg.timezoneIndex];
    const format = TIME_FORMATS[cfg.formatIndex];
    const frame = FRAME_STYLES[cfg.frameIndex];

    const formattedTime = format.format(time);

    const lines = [
      `Time: ${formattedTime}`,
      `Timezone: ${timezone.name}`,
      `Format: ${format.name}`,
      `Frame: ${frame.name}`
    ];

    if (cfg.showHelp) {
      lines.push(
        "",
        "Controls:",
        "z/Z - cycle timezone forward/backward",
        "f/F - cycle time format forward/backward",
        "s/S - cycle frame style forward/backward",
        "h - toggle help",
        "q - quit"
      );
    }

    // Apply frame styling
    let content: string;
    if (frame.chars === null) {
      content = lines.join('\n');
    } else {
      const maxWidth = Math.max(...lines.map(line => line.length));
      const width = Math.max(maxWidth + 4, 30); // Minimum width
      const { tl, tr, bl, br, h, v } = frame.chars;

      const top = tl + h.repeat(width - 2) + tr;
      const bottom = bl + h.repeat(width - 2) + br;

      const framedLines = [
        top,
        ...lines.map(line => v + " " + line.padEnd(width - 4) + " " + v),
        bottom
      ];

      content = framedLines.join('\n');
    }

    return { rendered: content };
  }, name("display"));

// 5. Renderer (reactive display)
const renderer = derive([display.reactive], ([displayData], ctl) => {
  let lastOutput = "";

  // Auto-render when display data changes
  if (displayData.rendered !== lastOutput) {
    process.stdout.write('\x1b[H\x1b[J'); // Home + clear
    process.stdout.write(displayData.rendered);
    lastOutput = displayData.rendered;
  }

  return { data: displayData };
}, name("renderer"));

// 6. Input handler
const inputHandler = derive([configController], ([ctrl], ctl) => {
  const handleKey = (key: string) => {
    switch (key) {
      case 'z': ctrl.cycleTimezoneForward(); break;
      case 'Z': ctrl.cycleTimezoneBackward(); break;
      case 'f': ctrl.cycleFormatForward(); break;
      case 'F': ctrl.cycleFormatBackward(); break;
      case 's': ctrl.cycleFrameForward(); break;
      case 'S': ctrl.cycleFrameBackward(); break;
      case 'h': ctrl.toggleHelp(); break;
      case 'q': case '\u0003': process.exit(0);
    }
  };

  // Check if setRawMode is available (terminal environment)
  if (typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (data) => {
    const key = data.toString();
    handleKey(key);
  });

  ctl.cleanup(() => {
    process.stdin.removeAllListeners('data');
    if (typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
  });

  return { handleKey };
}, name("input-handler"));

// 7. Timer (updates time source)
const timer = derive([timeSource.static], ([timeAccessor], ctl) => {
  const tick = () => {
    timeAccessor.update(new Date());
  };

  process.stdout.write('\x1b[?25l'); // Hide cursor
  tick(); // Initial time set

  const interval = setInterval(tick, 1000);
  ctl.cleanup(() => clearInterval(interval));

  return { tick };
}, name("timer"));

// 8. App coordinator
const app = derive([timer, inputHandler, renderer], ([timerCtrl, input, display]) => ({
  ...timerCtrl,
  ...input,
  display
}), name("app"));

// Main
async function main() {
  const scope = createScope();
  try {
    await scope.resolve(app);

    // Handle shutdown signals
    const shutdown = async () => {
      process.stdout.write('\x1b[?25h\n'); // Show cursor
      console.log("Thanks for using Time Display!");
      await scope.dispose();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGHUP', shutdown);

  } catch (error) {
    console.error('Error:', error);
    process.stdout.write('\x1b[?25h\n'); // Show cursor
    await scope.dispose();
    process.exit(1);
  }
}

main().catch(console.error);