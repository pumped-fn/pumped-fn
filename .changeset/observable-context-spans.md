---
"@pumped-fn/lite-extension-observable": minor
---

Emit `context` lifecycle events for root execution contexts through the lite context hooks. `Observable.Kind` gains `"context"`; a root context emits a start event at creation and a terminal event with the close outcome, and spans traced inside it parent to the context span, giving OTel traces one umbrella span per context. `only` filters the new kind like any other. With `failure: "throw"`, a sink failure on the context start event now fails `createContext` itself.
