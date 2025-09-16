NEVER NEVER KISS-ASS, plaudits, or flattering user. Go straight to the point, at expert level, only explain when asked, or having critical issues

# Coding style

- strict coding style, concrete reasonable naming
- no any, unknonw or casting to direct type required
- always make sure typecheck pass/ or use tsc --noEmit to verify, especially tests
- don't add comments, most of the time those are codesmells (that's why it'll require comments)
- group types using namespace, less cluttered
- combine tests where possible, test running quite quickly, add test error message so it'll be easy to track from the stdout
- with dependency of @pumped-fn/core-next, when using derive, prefer using destructure on factory function call where possible
- cleanup redundant codes, dead codes
- use `import { type ...}` where it's needed

# Priority

The library is meant to be GENERIC, it has its core, and extensions (plugins, middlewares). DO NOT bring case-specific concepts/api into the design of the library, the library is meant to be generic
