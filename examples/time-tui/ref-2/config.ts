import { provide, derive, name } from '@pumped-fn/core-next';

export const FRAME_STYLES = [
  { name: 'Classic Box', chars: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' } },
  { name: 'Double Line', chars: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' } },
  { name: 'Rounded', chars: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' } },
  { name: 'ASCII Simple', chars: { tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|' } },
  { name: 'Stars', chars: { tl: '*', tr: '*', bl: '*', br: '*', h: '*', v: '*' } },
  { name: 'Dots', chars: { tl: '·', tr: '·', bl: '·', br: '·', h: '·', v: '·' } },
  { name: 'Heavy', chars: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' } },
  { name: 'Dashed', chars: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '┄', v: '┆' } },
  { name: 'None', chars: { tl: '', tr: '', bl: '', br: '', h: '', v: '' } }
] as const;

export interface AppConfig {
  selectedTimezone: number;
  selectedFormat: number;
  selectedFrame: number;
  showHelp: boolean;
  updateInterval: number;
}

export const config = provide(() => ({
  selectedTimezone: 0,
  selectedFormat: 0,
  selectedFrame: 0,
  showHelp: false,
  updateInterval: 1000
}), name('config'));

export const configController = derive(
  config.static,
  (accessor) => {
    const cycleTimezone = (direction: 'forward' | 'backward') => {
      accessor.update(current => ({
        ...current,
        selectedTimezone: direction === 'forward'
          ? (current.selectedTimezone + 1) % 10
          : (current.selectedTimezone - 1 + 10) % 10
      }));
    };

    const cycleFormat = (direction: 'forward' | 'backward') => {
      accessor.update(current => ({
        ...current,
        selectedFormat: direction === 'forward'
          ? (current.selectedFormat + 1) % 6
          : (current.selectedFormat - 1 + 6) % 6
      }));
    };

    const cycleFrame = (direction: 'forward' | 'backward') => {
      accessor.update(current => ({
        ...current,
        selectedFrame: direction === 'forward'
          ? (current.selectedFrame + 1) % 9
          : (current.selectedFrame - 1 + 9) % 9
      }));
    };

    const toggleHelp = () => {
      accessor.update(current => ({
        ...current,
        showHelp: !current.showHelp
      }));
    };

    return {
      cycleTimezone,
      cycleFormat,
      cycleFrame,
      toggleHelp
    };
  },
  name('config-controller')
);