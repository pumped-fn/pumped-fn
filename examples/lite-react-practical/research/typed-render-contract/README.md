# Typed render contract DKR

This spike checks whether a strict spec and catalog can keep designer iteration while preserving pumped-fn's TypeScript and testability value.

The contract deliberately keeps React components as catalog implementations. The spec names catalog components, slots, props, bindings, events, and flows. React lowers that contract into host components, including headless behavior such as a normalized sortable move event.

The verifier rejects detail-level drift:

- unknown state path
- wrong prop value kind
- unknown slot
- unknown event
- unknown flow
- wrong flow payload kind
- unbound template placeholder
- unreferenced template arg
- repeat item field outside the catalog-derived item scope

The TypeScript side checks state paths and flow payload shape before JSON exists. The JSON side stays portable but is verified from the same catalog, state path, and flow registry.

The accepted DKR checkpoint is not package promotion. Raw `JsonSpec` authoring, generalized watch/runtime lowering, reusable event normalization, and renderer portability remain open package gates.
