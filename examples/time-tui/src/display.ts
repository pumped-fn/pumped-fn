import { derive, name } from "@pumped-fn/core-next";
import { timeSource, TIMEZONES, TIME_FORMATS } from "./time-source";
import { config } from "./config";

export const FRAME_STYLES = [
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

function applyFrame(content: string[], frameStyle: typeof FRAME_STYLES[number]) {
  if (!frameStyle.chars) return content;

  const { tl, tr, bl, br, h, v } = frameStyle.chars;
  const maxWidth = Math.max(...content.map(line => line.length));

  const topBorder = tl + h.repeat(maxWidth + 2) + tr;
  const bottomBorder = bl + h.repeat(maxWidth + 2) + br;

  const framedContent = content.map(line =>
    v + " " + line.padEnd(maxWidth) + " " + v
  );

  return [topBorder, ...framedContent, bottomBorder];
}

export const display = derive([timeSource.reactive, config.reactive],
  ([time, cfg]) => {
    const timezone = TIMEZONES[cfg.timezoneIndex];
    const format = TIME_FORMATS[cfg.formatIndex];
    const frameStyle = FRAME_STYLES[cfg.frameStyleIndex];

    const formattedTime = format.format(time, timezone.tz);

    let content = [
      `Time: ${formattedTime}`,
      `Timezone: ${timezone.name}`,
      `Format: ${format.name}`,
      `Frame: ${frameStyle.name}`
    ];

    if (cfg.showHelp) {
      content = content.concat([
        "",
        "Controls:",
        "z/Z - cycle timezone backward/forward",
        "f/F - cycle format backward/forward",
        "s/S - cycle frame style backward/forward",
        "h - toggle help",
        "q - quit"
      ]);
    } else {
      content.push("", "Press h for help");
    }

    const framedContent = applyFrame(content, frameStyle);

    const rendered = framedContent.join('\n');

    return {
      rendered,
      lines: framedContent.length,
      width: Math.max(...framedContent.map(line => line.length))
    };
  }, name("display"));