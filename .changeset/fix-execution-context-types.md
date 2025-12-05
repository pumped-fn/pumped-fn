---
"@pumped-fn/lite": patch
---

fix(lite): improve ExecutionContext and ExecFlowOptions type inference

**Type System Improvements:**
- Remove unnecessary `TInput` generic from `ExecutionContext` interface
- Add proper output/input type inference to `ExecFlowOptions<Output, Input>`
- Make `input` property optional for void/undefined/null input flows
- Update `FlowFactory` to use intersection type for input typing
- Simplify `Extension.wrapResolve` and `wrapExec` to use `unknown`
- Flows without `parse` now return `Flow<Output, void>` for better DX

**DX Improvements:**
```typescript
// No input needed for void flows - clean DX
ctx.exec({ flow: voidFlow })

// Input required and type-checked for typed flows
ctx.exec({ flow: inputFlow, input: "hello" })
```

**Test Consolidation:**
- Reduced test count from 149 to 130 (-13%)
- Removed duplicate and superficial tests
- Consolidated similar test patterns
