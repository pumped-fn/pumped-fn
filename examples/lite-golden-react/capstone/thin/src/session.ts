import { atom } from "@pumped-fn/lite"

export const sessionToken = atom({ factory: (): string | null => null })
