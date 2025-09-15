import { derive, name } from '@pumped-fn/core-next';
import { currentTime } from './time.js';
import { config } from './config.js';
import { TIMEZONES, TIME_FORMATS } from './time.js';
import { FRAME_STYLES } from './config.js';

export const formattedTime = derive(
  [currentTime.reactive, config.reactive],
  ([time, cfg]) => {
    const timezone = TIMEZONES[cfg.selectedTimezone];
    const formatter = TIME_FORMATS[cfg.selectedFormat];

    let dateToFormat = time;
    if (timezone.timezone) {
      const timeInZone = new Date(time.toLocaleString('en-US', { timeZone: timezone.timezone }));
      dateToFormat = timeInZone;
    }

    const customFormat = (date: Date, timeZone?: string) => {
      switch (cfg.selectedFormat) {
        case 0: // 24-hour
          return date.toLocaleTimeString('en-US', { hour12: false, timeZone });
        case 1: // 12-hour
          return date.toLocaleTimeString('en-US', { hour12: true, timeZone });
        case 2: // ISO 8601
          return date.toISOString().split('T')[1].split('.')[0];
        case 3: // Unix Timestamp
          return Math.floor(date.getTime() / 1000).toString();
        case 4: // Full Date Time
          return date.toLocaleString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone
          });
        case 5: // Milliseconds
          return date.toLocaleTimeString('en-US', { hour12: false, timeZone }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
        default:
          return date.toLocaleTimeString('en-US', { hour12: false, timeZone });
      }
    };

    return {
      formatted: customFormat(time, timezone.timezone),
      timezoneName: timezone.name,
      formatName: TIME_FORMATS[cfg.selectedFormat].name,
      frameName: FRAME_STYLES[cfg.selectedFrame].name
    };
  },
  name('formatted-time')
);

export const frameRenderer = derive(
  config.reactive,
  (cfg) => {
    const frameStyle = FRAME_STYLES[cfg.selectedFrame];

    const createFrame = (lines: string[]) => {
      if (frameStyle.name === 'None') {
        return lines.join('\n');
      }

      const maxWidth = Math.max(...lines.map(line => line.length));
      const { tl, tr, bl, br, h, v } = frameStyle.chars;

      const topBorder = tl + h.repeat(maxWidth + 2) + tr;
      const bottomBorder = bl + h.repeat(maxWidth + 2) + br;

      const framedLines = lines.map(line =>
        v + ' ' + line.padEnd(maxWidth) + ' ' + v
      );

      return [topBorder, ...framedLines, bottomBorder].join('\n');
    };

    return { createFrame };
  },
  name('frame-renderer')
);

export const helpText = derive(
  config.reactive,
  (cfg) => {
    if (!cfg.showHelp) return { content: '' };

    const helpLines = [
      'KEYBOARD SHORTCUTS:',
      '',
      'z/Z - Cycle timezone forward/backward',
      'f/F - Cycle time format forward/backward',
      's/S - Cycle frame style forward/backward',
      'h   - Toggle this help display',
      'q   - Quit application',
      'Ctrl+C - Force quit',
      '',
      'Press h to hide this help'
    ];

    return { content: helpLines.join('\n') };
  },
  name('help-text')
);

export const renderer = derive(
  [formattedTime.reactive, frameRenderer.reactive, helpText.reactive],
  ([timeData, frame, help]) => {
    const clearScreen = () => {
      process.stdout.write('\x1b[2J\x1b[H');
    };

    const render = () => {
      clearScreen();

      const mainContent = [
        `Time: ${timeData.formatted}`,
        `Timezone: ${timeData.timezoneName}`,
        `Format: ${timeData.formatName}`,
        `Frame: ${timeData.frameName}`,
        '',
        'Press h for help, q to quit'
      ];

      let output = frame.createFrame(mainContent);

      if (help.content) {
        output += '\n\n' + help.content;
      }

      console.log(output);
    };

    return { render, clearScreen };
  },
  name('renderer')
);