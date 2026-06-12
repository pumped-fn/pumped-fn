import { atom } from "@pumped-fn/lite"

export interface IdsPort {
  next(prefix: string): string
}

export const ids = atom<IdsPort>({
  factory: () => {
    let nextId = 0
    return {
      next(prefix) {
        nextId++
        return `${prefix}-${nextId}`
      },
    }
  },
})
