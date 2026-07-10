import { controller, flow, typed } from "@pumped-fn/lite"
import { archive, shareTarget, type Ingredient } from "./ports"

export type RecipeEvent =
  | { stage: "fetched" }
  | { stage: "converted" }
  | { stage: "shared"; id: string }

export type CollectionEvent =
  | RecipeEvent
  | { slug: string; done: number; total: number; id: string }

export type CollectionSummary = { exported: number; failedSlugs: string[] }

type Fault = { code: "UNIT_UNKNOWN"; slug: string; unit: string }

const toMetric = (ingredient: Ingredient): Ingredient | null => {
  switch (ingredient.unit) {
    case "cup":
      return { name: ingredient.name, quantity: ingredient.quantity * 240, unit: "ml" }
    case "tbsp":
      return { name: ingredient.name, quantity: ingredient.quantity * 15, unit: "ml" }
    case "oz":
      return { name: ingredient.name, quantity: ingredient.quantity * 28, unit: "g" }
    case "lb":
      return { name: ingredient.name, quantity: ingredient.quantity * 454, unit: "g" }
    case "g":
    case "ml":
      return { name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit }
    default:
      return null
  }
}

export const exportRecipe = flow({
  name: "recipes.exportRecipe",
  parse: typed<{ slug: string }>(),
  faults: typed<Fault>(),
  deps: { archive, shareTarget },
  factory: async function* (ctx, { archive, shareTarget }): AsyncGenerator<RecipeEvent, { id: string }, unknown> {
    const record = await ctx.exec({
      fn: () => archive.fetch(ctx.input.slug),
      params: [],
      name: "archive.fetch",
    })
    yield { stage: "fetched" }
    const ingredients: Ingredient[] = record.ingredients.map((ingredient) => {
      const converted = toMetric(ingredient)
      return converted === null
        ? ctx.fail({ code: "UNIT_UNKNOWN", slug: ctx.input.slug, unit: ingredient.unit })
        : converted
    })
    yield { stage: "converted" }
    const shared = await ctx.exec({
      fn: () => shareTarget.write({ slug: record.slug, title: record.title, ingredients }),
      params: [],
      name: "shareTarget.write",
    })
    yield { stage: "shared", id: shared.id }
    return shared
  },
})

export const exportCollection = flow({
  name: "recipes.exportCollection",
  parse: typed<{ slugs: string[] }>(),
  deps: { exportRecipe: controller(exportRecipe) },
  factory: async function* (ctx, { exportRecipe }): AsyncGenerator<CollectionEvent, CollectionSummary, unknown> {
    let exported = 0
    const failedSlugs: string[] = []
    for (const slug of ctx.input.slugs) {
      const stream = exportRecipe.execStream({ input: { slug } })
      yield* stream
      const shared = await stream.result
      exported += 1
      yield { slug, done: exported, total: ctx.input.slugs.length, id: shared.id }
    }
    return { exported, failedSlugs }
  },
})
