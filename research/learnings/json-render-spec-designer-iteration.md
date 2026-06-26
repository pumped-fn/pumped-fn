# Json Render Spec Designer Iteration

Session: `json-render-spec-designer-iteration`

Goal: use a strict spec/catalog render contract as a designer-owned iteration surface while keeping React useful and keeping pumped-fn as the state, action, scope, and test owner.

Frame status: ratified working frame for package-promotion decisions. Active OKR artifact: `research/okrs/json-render-spec-contract.md`.

Objective metric: `validated_spec_cases_passed >= 4` and `unchecked_path_or_binding_count == 0`.

Anti-goals:
- React distance: `promoted_spec_cases_render_through_react == validated_spec_cases_passed`.
- Pumped-fn wrapper drift: `bypassed_lite_state_or_action_paths == 0`.
- Designer footgun drift: `react_cleanup_diff_lines_per_spec_iteration <= 10`.
- Platform drift: `spec_semantics_changed_between_renderers == 0`.
- Typecheck loss: `unchecked_path_or_binding_count == 0`.
- Hidden workflow drift: `workflow_logic_inside_spec_count == 0`.
- Laziness drift: `import_time_verification_or_scope_creation_count == 0`.
- Hook-quality drift: `react_hook_dependency_violation_count == 0`.
- DKR truth drift: `single_llm_truth_acceptance_count == 0`; every accepted DKR checkpoint needs deterministic evidence plus independent review.

Learning checkpoint:
- Decision target: promote or reject concrete CKR/PKR work for proving json-render specs as a designer iteration layer.
- Evidence collected:
  - Workspace catalog pins `@json-render/core` and `@json-render/react` at `0.19.0`.
  - Packed npm artifacts for `@json-render/core@0.19.0` and `@json-render/react@0.19.0` were inspected from `/tmp/json-render-core-0.19.0` and `/tmp/json-render-react-0.19.0`.
  - `@json-render/react` controlled mode states that when `store` is provided, `initialState` and `onStateChange` are ignored and the store is the single source of truth.
  - The exported json-render `StateStore` contract is JSON Pointer `get`, `set`, batched `update`, `getSnapshot`, optional `getServerSnapshot`, and `subscribe`.
  - The exported json-render `UIElement` contract includes `props`, `children`, `visible`, `on`, `repeat`, and `watch`.
  - The exported React provider contract includes `JSONUIProvider` with `store`, `handlers`, `navigate`, `validationFunctions`, `functions`, and `directives`.
  - Current F14 proves `$bindState`, `$state`, `on.press`, Lite flow execution, stable handler retargeting, and real `JSONUIProvider` plus `Renderer`.
  - Verification commands passed:
    - `pnpm -F @pumped-fn/lite-react-json-render test -- --run`: 1 file, 5 tests.
    - `pnpm -F lite-react-practical test -- --run examples/lite-react-practical/patterns/F14-json-render-state-store/after.test.ts`: 25 files, 103 tests, 100% coverage.
    - `pnpm -F @pumped-fn/lite-react-practical typecheck`.
    - `pnpm -F @pumped-fn/lite-react-practical exec vitest run research/typed-render-contract/contract.test.ts`: 1 file, 6 tests.
    - `pnpm -F @pumped-fn/lite-react-practical exec vitest run --project browser research/typed-render-contract/view.browser.test.tsx`: 1 file, 1 browser test.
  - `pnpm lint`: 155 files, 0 diagnostics.
  - Current next-DKR verification commands passed:
    - `pnpm -F @pumped-fn/lite-react-practical typecheck`.
    - `pnpm -F @pumped-fn/lite-react-practical exec vitest run research/typed-render-contract/contract.test.ts`: 1 file, 10 tests.
    - `pnpm -F @pumped-fn/lite-react-practical exec vitest run --project browser research/typed-render-contract/view.browser.test.tsx`: 1 file, 1 browser test.
    - `pnpm lint`: 155 files, 0 diagnostics.
    - `git diff --check`.
  - The DKR prototype in `examples/lite-react-practical/research/typed-render-contract` proves a catalog-backed path type, runtime detail verifier, valid JSON-like spec, and React lowering over Lite scoped values and flows.
  - `research/okrs/json-render-spec-contract.md` now records the ratified working frame, action envelope, eval points, flags, cadence, CKRs, DKRs, and PKRs for package-promotion decisions.
  - Independent Claude and Codex reviews converged that the prototype proves the direction but does not yet prove `unchecked_path_or_binding_count == 0` as a package gate.
  - Independent Claude and Codex reviews accepted the next DKR as a candidate learning checkpoint with no blocking findings; `single_llm_truth_acceptance_count` stays `0` and `independent_review_before_dkr_acceptance_count = 2`.

Questions answered:
- Is a new adapter API required before learning can progress? No. Current `scopedValueStateStore`, `flowAction`, `flowHandlers`, and `useFlowHandlers` are enough to prove the next designer-iteration cases.
- Is F14 already enough to satisfy the objective? No. It proves one integration shape, not four spec-only designer edits.
- Which json-render spec axes are contractual enough to promote? `visible`, `$cond`, `$template`, `$computed`, `watch`, `repeat`, built-in state actions, and action lifecycle hooks are all visible in the package docs/types. For this repo, the best initial set is `visible`, computed/template props, `repeat`, and `watch` because they prove designer-owned behavior without requiring new async or navigation semantics first.
- Is the current json-render bridge itself the desired product surface? No. The useful concept is the strict spec/catalog boundary. The current package is mostly an adapter to an external renderer, so it is only justified as prior art or compatibility unless the project owns a render contract that preserves spec semantics across React and React Native.
- Can the spec rely on raw path-access strings and still preserve pumped-fn value? No. If paths, bindings, component props, slots, event names, and action payloads cannot be checked at detail level, the spec loses the TypeScript/testability value that pumped-fn is supposed to expose.
- Is detail-level verification achievable? Yes, for the tested slice, but not yet as a package gate. The current prototype verifies a JSON artifact against a trusted catalog; independent review found that catalog-to-domain links are still manually maintained, so the zero-unchecked-binding claim is unproven until those links become mechanically checked.

Probability updates:
- `P(current adapter can support objective without new public API) = 0.45`.
- `P(F14 can be extended into the main proof surface without drifting from React) = 0.55`.
- `P(a pumped-fn-owned spec/catalog renderer is the right main surface) = 0.80`.
- `P(watch-driven json-render actions expose a pumped-fn value difference over raw json-render) = 0.70`.
- `P(built-in setState examples would weaken pumped-fn ownership if used as the primary path) = 0.80`.
- `P(raw JSON Pointer strings are acceptable as the only spec authoring surface) = 0.10`.
- `P(a typed spec builder plus generated/verifiable JSON artifact is required) = 0.95`.
- `P(detail-level verification can preserve pumped-fn value for designer-owned JSON specs) = 0.70`.
- `P(current prototype is sufficient for package extraction) = 0.25`.

Risk and anti-goal implications:
- Built-in `setState`, `pushState`, `removeState`, and `validateForm` are useful json-render primitives, but making them the happy path can make pumped-fn look optional. Use them as a contrast or limited spec feature, not as the primary ownership proof.
- `$computed` and `functions` are synchronous json-render contracts. Keep async/domain work in Lite flows; adapt only already-resolved graph values or pure formatting functions to `functions`.
- `watch` is the most valuable next probe because it lets designer-authored spec changes trigger Lite-owned flows from state changes. It is also the riskiest because it can become hidden workflow logic if overused.
- `repeat` is a good designer iteration case for layout/data shape, but it should not own collection mutation. Collection mutation should remain a Lite flow.
- A pumped-fn renderer should make the spec the stable semantic unit and put platform renderers behind it. React and React Native should be integration points for the same intended render tree, not reasons to fork the spec.
- The renderer should be strict on purpose. React and Vite flexibility is the thing being constrained, so the catalog must narrow component vocabulary, prop schemas, event names, slots, and bindings enough that designer iteration cannot smuggle application logic into components.
- The platform adapter boundary must not reinterpret meaning. A `Button`, `Field`, `Stack`, `Visible`, `Action`, or `Repeat` node should preserve catalog meaning across React and React Native even when host components differ.
- The spec cannot be only a formula-level schema check. Verification must inspect each detail: component exists in catalog, prop names and values match prop schema, slots exist, child placement is valid, bindings point to existing typed state paths, bound state value type is compatible with the prop, events exist, event payload maps to a Lite flow input, repeat item paths are scoped correctly, and platform renderers support the node capability.
- Designer-owned JSON can be the portable artifact, but the source of truth should have a typechecked path to produce or verify it. A TypeScript spec builder, generated path tokens, or generated typecheck harness should fail `tsc` when a spec references a missing state path, wrong value type, unknown action, or unsupported catalog slot.
- The first proof should treat the path catalog as a generated contract, not as handwritten string discipline. The important property is that promoted specs have `unchecked_path_or_binding_count == 0`, regardless of whether the authoring surface is a builder, generated tokens, or a verifier-generated type fixture.
- No-single-LLM review found six package-gating gaps: flow registry/runtime dispatch drift, `ValueKind` not derived from `PathValue` or flow input types, template placeholders unchecked, watch verification broader than React behavior, repeat item shape hardcoded outside the catalog, and browser event normalization overclaimed by a synthetic button event.
- The accepted DKR1 binder checkpoint directly targets four of those gaps by using typed action binders, typed path tokens, catalog-derived repeat item scope, and verifier-checked template placeholders. Watch runtime semantics, browser event normalization, renderer portability, raw `JsonSpec` authoring, and hook dependency guarding remain separate gates.

Candidate CKRs:
- CKR1: `validated_spec_cases_passed >= 4` across conditional visibility, computed/template display, repeated line items, and event or watch-triggered Lite flow action.
- CKR2: `spec_semantics_changed_between_renderers == 0` between the React renderer and a React Native target model or adapter stub.
- CKR3: `bypassed_lite_state_or_action_paths == 0` for durable state changes and domain actions in the proof.
- CKR4: `catalog_escape_hatches_per_case == 0`; no arbitrary React component, render callback, Vite plugin, or platform-specific logic can be required to express the promoted spec cases.
- CKR5: `unchecked_path_or_binding_count == 0`; every promoted spec path, binding, event, and action payload is checked by TypeScript or by a verifier generated from TypeScript catalog and state models.
- CKR6: `react_hook_dependency_violation_count == 0`; React renderer work has a mechanical hook dependency guard before promotion.

Candidate PKRs:
- PKR1: Define the minimum pumped-fn-owned render spec and catalog vocabulary: elements, slots, props, bindings, events, actions, visibility, repeat, and computed display.
- PKR2: Build a React renderer over that contract using Lite-owned scoped values and flows for state/action semantics.
- PKR3: Build a React Native compatibility proof that consumes the same spec/catalog semantics, even if the first pass renders to a host-agnostic tree or adapter contract instead of a full app.
- PKR4: Add spec fixtures for conditional visibility, computed/template summary, repeated line items, and state-change-triggered Lite flow.
- PKR5: Add tests that compare the semantic render plan across renderers and prove React integration does not change what is meant to be rendered.
- PKR6: Reclassify `@pumped-fn/lite-react-json-render` as compatibility/prior art unless the owned renderer deliberately supports json-render import/export.
- PKR7: Prototype detail-level spec verification: a typed state path helper or generated path token set, catalog prop/slot/event inference, and a failing typecheck fixture for a bad path, bad prop type, unknown event, and wrong flow payload.

Candidate CKRs and candidate PKRs are not promoted until the orchestrator accepts the supporting DKR learning checkpoint.

DKR result:
- PKR7 has prototype evidence for one realistic board slice, but it is not sufficient for package extraction.
- DKR1 is accepted as a learning checkpoint after deterministic checks plus independent Claude/Codex review. It is not accepted as package-promotion proof.
- Promote CKR5 as the next measurement guardrail for any package work: `unchecked_path_or_binding_count == 0`.
- Promote PKR1 and PKR2 only as narrow package candidates if they keep React as a renderer integration point and Lite as the state/action/test seam.
- Promote the OKR gate in `research/okrs/json-render-spec-contract.md` as the package-promotion frame.

Next unknowns:
- How raw `JsonSpec` authoring becomes strict enough: typed builder, generated fixture, strict verifier pipeline, or hybrid.
- How the runtime view proves it honors the verified spec instead of hardcoded host behavior.
- How watch runtime semantics line up with what the verifier accepts without turning designer-owned spec into hidden workflow code.
- How reusable adapter-owned event normalization replaces the current fixed sortable button proof.
- What the minimum owned spec grammar should be without accidentally rebuilding all of React.
- Whether the first React Native proof should be a real native renderer or a semantic adapter test that proves the same render intent can lower to React Native host primitives.
- Whether json-render should remain as an import/export compatibility layer or be removed from the main narrative.

Human direction update:
- The human likes the spec/catalog concept because it makes the app stricter than React or Vite, and that constraint is the value.
- The needed work is a renderer based on that strict contract, supporting designer iteration while preserving integration points for frontend delivery and React Native without changing what is meant to be rendered.
- Pumped-fn should not own rendering itself. Its value is composition and testability; the render contract must preserve that by using TypeScript/detail verification instead of unchecked JSON path access.
