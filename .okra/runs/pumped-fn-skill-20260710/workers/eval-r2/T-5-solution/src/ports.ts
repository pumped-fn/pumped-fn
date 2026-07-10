import { atom } from "@pumped-fn/lite"

export type Ingredient = { name: string; quantity: number; unit: string }
export type LegacyRecord = { slug: string; title: string; ingredients: Ingredient[] }
export type SharedRecipe = { slug: string; title: string; ingredients: Ingredient[] }

export type LegacyArchive = { fetch: (slug: string) => Promise<LegacyRecord> }
export type ShareTarget = { write: (recipe: SharedRecipe) => Promise<{ id: string }> }

class ArchiveMissing extends Error {
  readonly kind = "archive-missing"
  readonly op = "fetch"
  readonly entity: string

  constructor(slug: string) {
    super(`Recipe not found: ${slug}`)
    this.entity = slug
  }
}

export const archive = atom({
  factory: function createSampleArchive(): LegacyArchive {
    const records: Record<string, LegacyRecord> = {
      granola: {
        slug: "granola",
        title: "Maple Granola",
        ingredients: [
          { name: "oats", quantity: 2, unit: "cup" },
          { name: "maple syrup", quantity: 2, unit: "tbsp" },
        ],
      },
      "soda-bread": {
        slug: "soda-bread",
        title: "Soda Bread",
        ingredients: [
          { name: "flour", quantity: 1, unit: "lb" },
          { name: "buttermilk", quantity: 1, unit: "cup" },
        ],
      },
      pesto: {
        slug: "pesto",
        title: "Basil Pesto",
        ingredients: [
          { name: "basil", quantity: 3, unit: "oz" },
          { name: "olive oil", quantity: 4, unit: "tbsp" },
        ],
      },
    }
    return {
      async fetch(slug) {
        const record = records[slug]
        if (!record) throw new ArchiveMissing(slug)
        return record
      },
    }
  },
})

export const shareTarget = atom({
  factory: function createSampleShareTarget(): ShareTarget {
    let nextId = 1
    return {
      async write(_recipe) {
        const id = `shared-${nextId}`
        nextId += 1
        return { id }
      },
    }
  },
})
