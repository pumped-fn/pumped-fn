import { controller, flow, typed } from "@pumped-fn/lite"
import { archive, shareTarget, type Ingredient, type SharedRecipe } from "./ports.js"

type RecipeProgress = { stage: "fetched" } | { stage: "converted" } | { stage: "shared"; id: string }
type CollectionProgress =
  | { slug: string; stage: "fetched" }
  | { slug: string; stage: "converted" }
  | { slug: string; stage: "shared"; id: string }
  | { slug: string; stage: "failed"; reason: string }
type UnitUnknown = { code: "UNIT_UNKNOWN"; unit: string }

function metric(ingredient: Ingredient): Ingredient | undefined {
  const conversions: Record<string, { unit: string; multiplier: number }> = {
    cup: { unit: "ml", multiplier: 240 },
    tbsp: { unit: "ml", multiplier: 15 },
    oz: { unit: "g", multiplier: 28 },
    lb: { unit: "g", multiplier: 454 },
    g: { unit: "g", multiplier: 1 },
    ml: { unit: "ml", multiplier: 1 },
  }
  const conversion = conversions[ingredient.unit]
  return conversion === undefined
    ? undefined
    : { name: ingredient.name, quantity: ingredient.quantity * conversion.multiplier, unit: conversion.unit }
}

function failureReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const exportRecipe = flow({
  name: "export-recipe",
  parse: typed<{ slug: string }>(),
  faults: typed<UnitUnknown>(),
  deps: { archive, shareTarget },
  factory: async function* (ctx, { archive, shareTarget }) {
    const legacy = await ctx.exec({ fn: () => archive.fetch(ctx.input.slug), params: [], name: "archive.fetch" })
    yield { stage: "fetched" }
    const ingredients: Ingredient[] = []
    for (const ingredient of legacy.ingredients) {
      const converted = metric(ingredient)
      if (converted === undefined) {
        ctx.fail({ code: "UNIT_UNKNOWN", unit: ingredient.unit })
      } else {
        ingredients.push(converted)
      }
    }
    const recipe: SharedRecipe = { slug: legacy.slug, title: legacy.title, ingredients }
    yield { stage: "converted" }
    const shared = await ctx.exec({ fn: () => shareTarget.write(recipe), params: [], name: "share-target.write" })
    yield { stage: "shared", id: shared.id }
    return shared
  },
})

export const exportCollection = flow({
  name: "export-collection",
  parse: typed<{ slugs: string[] }>(),
  deps: { exportRecipe: controller(exportRecipe) },
  factory: async function* (ctx, { exportRecipe }) {
    const failedSlugs: string[] = []
    let exported = 0
    for (const slug of ctx.input.slugs) {
      try {
        const stream = exportRecipe.execStream({ input: { slug } })
        for await (const event of stream) {
          yield event.stage === "shared"
            ? { slug, stage: "shared", id: event.id }
            : { slug, stage: event.stage }
        }
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
