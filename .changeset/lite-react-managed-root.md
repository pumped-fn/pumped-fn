---
"@pumped-fn/lite-react": patch
---

Fix managed `ExecutionContextProvider` identity so separate React roots using the same Lite scope do not share managed execution contexts. React observer tests now target Vitest Browser Mode while node graph tests remain the logic seam.
