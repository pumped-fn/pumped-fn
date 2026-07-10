import { atom } from "@pumped-fn/lite"

export type Ingredient = { name: string; quantity: number; unit: string }
export type LegacyRecord = { slug: string; title: string; ingredients: Ingredient[] }
export type SharedRecipe = { slug: string; title: string; ingredients: Ingredient[] }
export type LegacyArchive = { fetch: (slug: string) => Promise<LegacyRecord> }
export type ShareTarget = { write: (recipe: SharedRecipe) => Promise<{ id: string }> }

export const archive = atom({
  factory: () => {
    const records: Record<string, LegacyRecord> = {
      granola: {
        slug: "granola",
        title: "Pantry Granola",
        ingredients: [{ name: "oats", quantity: 2, unit: "cup" }, { name: "oil", quantity: 2, unit: "tbsp" }],
      },
      "soda-bread": {
        slug: "soda-bread",
        title: "Soda Bread",
        ingredients: [{ name: "flour", quantity: 1, unit: "lb" }, { name: "butter", quantity: 1, unit: "oz" }],
      },
      pesto: {
        slug: "pesto",
        title: "Basil Pesto",
        ingredients: [{ name: "basil", quantity: 1, unit: "oz" }, { name: "oil", quantity: 4, unit: "tbsp" }],
      },
    }
    return {
      fetch: async (slug: string) => {
        const record = records[slug]
        if (!record) throw new ArchiveError(`Recipe not found: ${slug}`)
        return record
      },
    } satisfies LegacyArchive
  },
})

export const shareTarget = atom({
  factory: () => {
    let nextId = 1
    return {
      write: async (_recipe: SharedRecipe) => ({ id: `shared-${nextId++}` }),
    } satisfies ShareTarget
  },
})

export class ArchiveError extends Error {
  readonly kind = "ARCHIVE_ERROR"

  constructor(message: string) {
    super(message)
    this.name = "ArchiveError"
  }
}
