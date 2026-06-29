import type { Lite } from "@pumped-fn/lite"
import { createRunJsonAction, type RenderActionInput } from "./action"
import { createAuthor, type Author } from "./author"
import { defineCatalog, type CatalogInput, type TypedCatalog } from "./catalog"
import type { BaseSchema, Infer } from "./schema"
import type { ActionToken, JsonSpec, VerificationResult, VerifyContext } from "./spec"
import { buildStateTokens } from "./tokens"
import { verifySpec } from "./verify"

/**
 * Single inferred render contract. Pass one `{ schema, state, catalog, actions }` and get the typed author,
 * a bound verifier, the dispatcher flow, and the verify context — all wired from the same sources so they
 * cannot drift. Everything is inferred: authoring, verifying, and dispatching need no type annotations.
 * `rendererCapabilities` is derived as the union of every catalog component's `capabilities`.
 */
function defineRender<
  const S extends BaseSchema,
  const C extends CatalogInput,
  const R extends Record<string, ActionToken>,
  St extends Lite.Resource<{ get(): Infer<S> }>,
>(config: {
  schema: S
  state: St
  catalog: C
  actions: R
}): {
  author: Author<TypedCatalog<C>, R, S>
  verify: (spec: JsonSpec) => VerificationResult
  dispatch: Lite.Flow<unknown, RenderActionInput>
  context: VerifyContext
  state: St
} {
  const components = defineCatalog(config.catalog)
  const context: VerifyContext = {
    state: buildStateTokens(config.schema),
    components,
    actions: config.actions,
    rendererCapabilities: new Set(Object.values(config.catalog).flatMap((entry) => entry.capabilities)),
  }
  return {
    author: createAuthor({ catalog: components, registry: config.actions, schema: config.schema }),
    verify: (spec) => verifySpec(spec, context),
    dispatch: createRunJsonAction({ registry: config.actions, state: config.state }),
    context,
    state: config.state,
  }
}

export { defineRender }
