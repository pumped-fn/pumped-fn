import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { compareRoot } from "../pages-lib.mjs"

const authoredFiles = [
  "src/app.tsx",
  "src/styles.css",
  "sandbox/styles.css",
]
const unsupportedColorFunction = /\b(?:color|color-mix|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/gi
const colorToken = /#[\da-fA-F]{3,8}\b|rgba?\([^)]*\)/g

function hexChannels(token) {
  const value = token.slice(1)
  if (![3, 4, 6, 8].includes(value.length) || !/^[\da-f]+$/i.test(value)) {
    throw new Error(`unsupported hex color syntax: ${token}`)
  }
  const normalized = value.length <= 4 ? [...value].map((part) => `${part}${part}`).join("") : value
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16))
}

function rgbChannels(token) {
  const value = token.slice(token.indexOf("(") + 1, -1).trim()
  if (value.includes("%") || /\b(?:calc|var)\s*\(/i.test(value)) throw new Error(`unsupported rgb color syntax: ${token}`)
  const channels = value.replaceAll(",", " ").replace("/", " ").split(/\s+/).filter(Boolean)
  if (channels.length < 3 || channels.slice(0, 3).some((channel) => !/^\d+(?:\.\d+)?$/.test(channel))) {
    throw new Error(`unsupported rgb color syntax: ${token}`)
  }
  return channels.slice(0, 3).map(Number)
}

function assertGrayscale(token, source) {
  if (!token.startsWith("#") && !/^rgba?\(/i.test(token)) throw new Error(`unsupported color syntax in ${source}: ${token}`)
  const [red, green, blue] = token.startsWith("#") ? hexChannels(token) : rgbChannels(token)
  if (red !== green || green !== blue) throw new Error(`non-grayscale authored color in ${source}: ${token}`)
}

export async function auditAuthoredGrayscale() {
  let checkedColorCount = 0
  for (const relativePath of authoredFiles) {
    const source = await readFile(join(compareRoot, relativePath), "utf8")
    checkedColorCount += auditAuthoredSource(source, relativePath)
  }
  if (checkedColorCount === 0) throw new Error("authored grayscale audit found no color tokens")
  return checkedColorCount
}

export function auditAuthoredSource(source, relativePath) {
  const unsupported = [...source.matchAll(unsupportedColorFunction)].map(([match]) => match)
  if (unsupported.length > 0) throw new Error(`unsupported authored color syntax in ${relativePath}: ${unsupported.join(", ")}`)
  let checkedColorCount = 0
  for (const [token] of source.matchAll(colorToken)) {
    assertGrayscale(token, relativePath)
    checkedColorCount += 1
  }
  if (relativePath.endsWith(".css")) {
    for (const [, property, rawValue] of source.matchAll(/(?:^|[;{\n])\s*([\w-]+)\s*:\s*([^;{}]+);/g)) {
      if (property === "color-scheme" || !/(?:color|background|border|outline|shadow|fill|stroke)/i.test(property)) continue
      const remainder = rawValue
        .replace(colorToken, " ")
        .replace(/-?\d*\.?\d+(?:px|rem|em|%|s|deg)?/gi, " ")
        .replace(/\b(?:solid|none|transparent|currentcolor|inherit|initial|unset|revert|inset|outset)\b/gi, " ")
        .replace(/[(),/.-]/g, " ")
        .trim()
      if (remainder !== "") throw new Error(`unsupported authored color syntax in ${relativePath}: ${property}: ${rawValue.trim()}`)
    }
  }
  if (relativePath === "src/app.tsx") {
    const theme = source.match(/const grayscaleTheme = \{\s*colors:\s*\{([\s\S]*?)\n\s*},\s*syntax:\s*\{([\s\S]*?)\n\s*},\s*font:/)
    if (!theme) throw new Error("grayscaleTheme colors and syntax blocks are missing")
    for (const block of theme.slice(1)) {
      for (const [, token] of block.matchAll(/"([^"]+)"/g)) {
        if (token === "italic") continue
        assertGrayscale(token, "src/app.tsx grayscaleTheme")
      }
    }
  }
  return checkedColorCount
}

export async function auditComputedGrayscale(page) {
  const findings = []
  for (const frame of page.frames()) {
    findings.push(...await frame.evaluate(() => {
      const properties = [
        "background-color",
        "background-image",
        "border-bottom-color",
        "border-left-color",
        "border-right-color",
        "border-top-color",
        "box-shadow",
        "caret-color",
        "color",
        "column-rule-color",
        "fill",
        "outline-color",
        "stroke",
        "text-decoration-color",
        "text-shadow",
      ]
      const unsupported = /\b(?:color|color-mix|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/i
      const rgb = /rgba?\(\s*(\d+(?:\.\d+)?)\s*(?:,|\s)\s*(\d+(?:\.\d+)?)\s*(?:,|\s)\s*(\d+(?:\.\d+)?)(?:\s*(?:,|\/)\s*[\d.]+)?\s*\)/g
      const localFindings = []
      for (const element of document.querySelectorAll("*")) {
        for (const pseudo of [null, "::before", "::after"]) {
          const style = getComputedStyle(element, pseudo)
          for (const property of properties) {
            const value = style.getPropertyValue(property)
            if (unsupported.test(value)) {
              localFindings.push(`${element.tagName}${pseudo ?? ""} ${property} unsupported ${value}`)
              continue
            }
            for (const match of value.matchAll(rgb)) {
              const [red, green, blue] = match.slice(1, 4).map(Number)
              if (red !== green || green !== blue) {
                localFindings.push(`${element.tagName}${pseudo ?? ""} ${property} ${match[0]}`)
              }
            }
          }
        }
      }
      return localFindings
    }))
  }
  if (findings.length > 0) throw new Error(`computed non-grayscale colors\n${findings.join("\n")}`)
  return 0
}

export async function auditHorizontalOverflow(page, viewport) {
  const overflow = await page.evaluate(() => ({
    documentClientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))
  if (overflow.documentScrollWidth > overflow.documentClientWidth || overflow.bodyScrollWidth > overflow.bodyClientWidth) {
    throw new Error(`horizontal overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(overflow)}`)
  }
  return overflow
}
