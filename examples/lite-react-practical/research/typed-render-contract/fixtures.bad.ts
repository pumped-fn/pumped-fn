import {
  action,
  actionRegistry,
  loadCardInput,
  moveCard,
  path,
  type KindFor,
  type PathValue,
} from "./contract"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

// @ts-expect-error /board/nope is not a schema-derived state path
export const badPath = path("/board/nope")

// @ts-expect-error loadCardInput is not the moveCard input schema
export const badActionPayload = action(moveCard, loadCardInput)

// @ts-expect-error missingFlow is not a member of the shared action registry
export const badActionKey = actionRegistry.missingFlow

// @ts-expect-error the ValueKind derived from a number PathValue is "number", not "string"
export type BadValueKind = Assert<Equal<KindFor<PathValue<"/board/metrics/total">>, "string">>
