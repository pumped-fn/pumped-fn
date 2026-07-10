import { controller, flow, typed } from "@pumped-fn/lite"
import { archive, shareTarget, type Ingredient, type SharedRecipe } from "./ports.js"

export type RecipeProgress =
  | { stage: "fetched" }
  | { stage: "converted" }
  | { stage: "shared"; id: string }

export type CollectionProgress =
  | { slug: string; stage: "fetched" }
  | { slug: string; stage: "converted" }
  | { slug: string; stage: "shared"; id: string }
  | { slug: string; stage: "failed"; reason: string }

type UnitUnknown = { code: "UNIT_UNKNOWN"; unit: string }

function convertIngredient(ingredient: Ingredient): Ingredient | UnitUnknown {
  switch (ingredient.unit) {
    case "cup": return { ...ingredient, quantity: ingredient.quantity * 240, unit: "ml" }
    case "tbsp": return { ...ingredient, quantity: ingredient.quantity * 15, unit: "ml" }
    case "oz": return { ...ingredient, quantity: ingredient.quantity * 28, unit: "g" }
    case "lb": return { ...ingredient, quantity: ingredient.quantity * 454, unit: "g" }
    case "g":
    case "ml": return ingredient
    default: return { code: "UNIT_UNKNOWN", unit: ingredient.unit }
  }
}

function failureReason(error: unknown): string {
  if (error instanceof Error) {
    const fault = "fault" in error ? error.fault : undefined
    if (fault && typeof fault === "object" && "code" in fault && fault.code === "UNIT_UNKNOWN") return "UNIT_UNKNOWN"
    return error.message
  }
  if (error && typeof error === "object" && "code" in error && error.code === "UNIT_UNKNOWN") return "UNIT_UNKNOWN"
  return String(error)
}

export const exportRecipe = flow({
  name: "export-recipe",
  parse: typed<{ slug: string }>(),
  faults: typed<UnitUnknown>(),
  deps: { archive, shareTarget },
  factory: async function* (ctx, { archive, shareTarget }): AsyncGenerator<RecipeProgress, { id: string }> {
    const record = await ctx.exec({
      fn: () => archive.fetch(ctx.input.slug),
      params: [],
      name: "archive.fetch",
    })
    yield { stage: "fetched" }
    const ingredients: Ingredient[] = []
    for (const ingredient of record.ingredients) {
      const converted = convertIngredient(ingredient)
      if ("code" in converted) {
        return ctx.fail(converted)
      }
      ingredients.push(converted)
    }
    const recipe: SharedRecipe = { slug: record.slug, title: record.title, ingredients }
    yield { stage: "converted" }
    const result = await ctx.exec({
      fn: () => shareTarget.write(recipe),
      params: [],
      name: "share-target.write",
    })
    yield { stage: "shared", id: result.id }
    return result
  },
})

export const exportCollection = flow({
  name: "export-collection",
  parse: typed<{ slugs: string[] }>(),
  deps: { exportRecipe: controller(exportRecipe) },
  factory: async function* (ctx, { exportRecipe }): AsyncGenerator<CollectionProgress, { exported: number; failedSlugs: string[] }> {
    let exported = 0
    const failedSlugs: string[] = []
    for (const slug of ctx.input.slugs) {
      try {
        const stream = exportRecipe.execStream({ input: { slug } })
        for await (const event of stream) yield { slug, ...event }
        await stream.result
        exported += 1
      } catch (error) {
        failedSlugs.push(slug)
        yield { slug, stage: "failed", reason: failureReason(error) }
      }
    }
    return { exported, failedSlugs }
  },
})
