import { controller, flow, typed } from "@pumped-fn/lite"
import { archive, shareTarget, type Ingredient } from "./ports"

export type RecipeEvent =
  | { stage: "fetched" }
  | { stage: "converted" }
  | { stage: "shared"; id: string }

export type CollectionEvent =
  | ({ slug: string } & RecipeEvent)
  | { slug: string; stage: "failed"; reason: string }

export type CollectionSummary = { exported: number; failedSlugs: string[] }

type Fault = { code: "UNIT_UNKNOWN"; slug: string; unit: string }

const metric: Record<string, { unit: string; factor: number }> = {
  cup: { unit: "ml", factor: 240 },
  tbsp: { unit: "ml", factor: 15 },
  oz: { unit: "g", factor: 28 },
  lb: { unit: "g", factor: 454 },
  g: { unit: "g", factor: 1 },
  ml: { unit: "ml", factor: 1 },
}

const reasonText = (error: unknown): string => {
  const parts: string[] = []
  let cursor: unknown = error
  while (cursor instanceof Error) {
    parts.push(cursor.message)
    const fault = (cursor as Error & { fault?: unknown }).fault
    if (fault !== undefined) parts.push(JSON.stringify(fault))
    cursor = cursor.cause
  }
  return parts.join(" ")
}

export const exportRecipe = flow({
  name: "recipes.exportRecipe",
  parse: typed<{ slug: string }>(),
  faults: typed<Fault>(),
  deps: { archive, shareTarget },
  factory: async function* (ctx, { archive, shareTarget }): AsyncGenerator<RecipeEvent, { id: string }, unknown> {
    const record = await archive.fetch(ctx.input.slug)
    yield { stage: "fetched" }
    const ingredients: Ingredient[] = record.ingredients.map((ingredient) => {
      const conversion = metric[ingredient.unit]
      if (conversion === undefined) {
        return ctx.fail({ code: "UNIT_UNKNOWN", slug: ctx.input.slug, unit: ingredient.unit })
      }
      return {
        name: ingredient.name,
        quantity: ingredient.quantity * conversion.factor,
        unit: conversion.unit,
      }
    })
    yield { stage: "converted" }
    const shared = await shareTarget.write({ slug: record.slug, title: record.title, ingredients })
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
      try {
        for await (const event of stream) {
          yield { slug, ...event }
        }
        await stream.result
        exported += 1
      } catch (error) {
        failedSlugs.push(slug)
        yield { slug, stage: "failed", reason: reasonText(error) }
      }
    }
    return { exported, failedSlugs }
  },
})
