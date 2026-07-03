import { tag } from "@pumped-fn/lite"

export interface CheckDefaults {
  checkInterval: number
  timeout: number
}

function parseCheckDefaults(raw: unknown): CheckDefaults {
  if (typeof raw !== "object" || raw === null) throw new Error("check defaults must be an object")
  const value = raw as CheckDefaults
  return {
    checkInterval: value.checkInterval,
    timeout: value.timeout,
  }
}

export const checkDefaults = tag<CheckDefaults>({
  label: "capstone.check.defaults",
  default: { checkInterval: 60, timeout: 1000 },
  parse: parseCheckDefaults,
})

export const requestId = tag<string>({
  label: "capstone.request.id",
})
