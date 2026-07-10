import { atom } from "@pumped-fn/lite"

export type Ingredient = { name: string; quantity: number; unit: string }
export type LegacyRecord = { slug: string; title: string; ingredients: Ingredient[] }
export type SharedRecipe = { slug: string; title: string; ingredients: Ingredient[] }
export type LegacyArchive = { fetch: (slug: string) => Promise<LegacyRecord> }
export type ShareTarget = { write: (recipe: SharedRecipe) => Promise<{ id: string }> }

const sampleRecords: LegacyRecord[] = [
  {
    slug: "granola",
    title: "Maple Granola",
    ingredients: [
      { name: "rolled oats", quantity: 3, unit: "cup" },
      { name: "maple syrup", quantity: 2, unit: "tbsp" },
    ],
  },
  {
    slug: "soda-bread",
    title: "Soda Bread",
    ingredients: [
      { name: "flour", quantity: 1, unit: "lb" },
      { name: "buttermilk", quantity: 1.5, unit: "cup" },
    ],
  },
  {
    slug: "pesto",
    title: "Basil Pesto",
    ingredients: [
      { name: "basil", quantity: 2, unit: "oz" },
      { name: "olive oil", quantity: 120, unit: "ml" },
    ],
  },
]

export const archive = atom({
  factory: (): LegacyArchive => ({
    fetch: (slug) => {
      const record = sampleRecords.find((candidate) => candidate.slug === slug)
      return record === undefined
        ? Promise.reject(new Error(`unknown slug: ${slug}`))
        : Promise.resolve(structuredClone(record))
    },
  }),
})

export const shareTarget = atom({
  factory: (): ShareTarget => {
    let nextId = 1
    return {
      write: (recipe) => {
        const id = `share-${nextId}-${recipe.slug}`
        nextId += 1
        return Promise.resolve({ id })
      },
    }
  },
})
