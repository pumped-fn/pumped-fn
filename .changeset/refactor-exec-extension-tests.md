---
"@pumped-fn/core-next": patch
---

Refactor FlowContext.exec for improved maintainability and add comprehensive extension tests

- Reduce exec method from 323 to 138 lines (72% reduction)
- Extract shared utilities: abort-utils, journal-utils
- Add helper methods: parseExecOverloads, executeJournaledFn, executeSubflow
- Add comprehensive extension tests with full operation metadata validation
- Verify extension wrapping order and nested operations
