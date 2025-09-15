import { derive, name } from '@pumped-fn/core-next';
import { timeDisplay } from './time-source.js';
import { config, TIMEZONES, TIME_FORMATS, FRAME_STYLES } from './config.js';

export interface FrameChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

const FRAME_STYLES_MAP: Record<string, FrameChars> = {
  'Classic Box': { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', horizontal: '─', vertical: '│' },
  'Double Line': { topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝', horizontal: '═', vertical: '║' },
  'Rounded': { topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯', horizontal: '─', vertical: '│' },
  'ASCII Simple': { topLeft: '+', topRight: '+', bottomLeft: '+', bottomRight: '+', horizontal: '-', vertical: '|' },
  'Stars': { topLeft: '*', topRight: '*', bottomLeft: '*', bottomRight: '*', horizontal: '*', vertical: '*' },
  'Dots': { topLeft: '·', topRight: '·', bottomLeft: '·', bottomRight: '·', horizontal: '·', vertical: '·' },
  'Heavy': { topLeft: '┏', topRight: '┓', bottomLeft: '┗', bottomRight: '┛', horizontal: '━', vertical: '┃' },
  'Dashed': { topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘', horizontal: '┄', vertical: '┆' },
  'None': { topLeft: '', topRight: '', bottomLeft: '', bottomRight: '', horizontal: '', vertical: '' }
};

function createFrame(content: string[], frameStyle: string, width: number): string[] {
  if (frameStyle === 'None') {
    return content;
  }

  const chars = FRAME_STYLES_MAP[frameStyle] || FRAME_STYLES_MAP['Classic Box'];
  const result: string[] = [];

  const topBorder = chars.topLeft + chars.horizontal.repeat(width - 2) + chars.topRight;
  result.push(topBorder);

  for (const line of content) {
    const padding = ' '.repeat(Math.max(0, width - 2 - line.length));
    result.push(chars.vertical + line + padding + chars.vertical);
  }

  const bottomBorder = chars.bottomLeft + chars.horizontal.repeat(width - 2) + chars.bottomRight;
  result.push(bottomBorder);

  return result;
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return text;
  const padding = Math.floor((width - text.length) / 2);
  return ' '.repeat(padding) + text + ' '.repeat(width - text.length - padding);
}

const HELP_TEXT = [
  'Keyboard Controls:',
  '',
  'z/Z - Cycle timezone forward/backward',
  'f/F - Cycle format forward/backward',
  's/S - Cycle frame style forward/backward',
  'h   - Toggle this help',
  'q   - Quit application',
  'Ctrl+C - Force quit',
  '',
  'Press h to hide this help'
];

export const displayFormatter = derive([timeDisplay.reactive, config.reactive], ([time, cfg]) => {
  const currentTimezone = TIMEZONES[cfg.timezoneIndex];
  const currentFormat = TIME_FORMATS[cfg.formatIndex];
  const currentFrameStyle = FRAME_STYLES[cfg.frameStyleIndex];

  const content: string[] = [];

  if (cfg.showHelp) {
    content.push(...HELP_TEXT);
  } else {
    content.push('');
    content.push(`Time: ${time.formattedTime}`);
    content.push('');
    content.push(`Timezone: ${currentTimezone}`);
    content.push(`Format: ${currentFormat}`);
    content.push(`Frame: ${currentFrameStyle}`);
    content.push('');
    content.push('Press h for help');
  }

  const maxWidth = Math.max(...content.map(line => line.length), 40);
  const frameWidth = maxWidth + 4;

  const centeredContent = content.map(line => centerText(line, maxWidth));
  const framedContent = createFrame(centeredContent, currentFrameStyle, frameWidth);

  return {
    lines: framedContent,
    width: frameWidth,
    height: framedContent.length
  };
}, name('display-formatter'));