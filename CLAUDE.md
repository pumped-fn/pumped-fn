# Upmost important

Sacrifice English grammar for conciseness. Concrete and straightforward

# Coding style

- strict coding style, concrete reasonable naming
- **ALWAYS** guarantee no any, unknonw or casting to direct type required
- **ALWAYS** make sure typecheck pass/ or use tsc --noEmit to verify, especially tests
- **NEVER** add comments, most of the time those are codesmells (that's why it'll require comments)
- group types using namespace, less cluttered
- combine tests where possible, test running quite quickly, add test error message so it'll be easy to track from the stdout
- with dependency of @pumped-fn/core-next, when using derive, prefer using destructure on factory function call where possible
- cleanup redundant codes, dead codes
- use `import { type ...}` where it's needed
- never use inline `import()`

# Priority

The library is meant to be GENERIC, it has its core, and extensions (plugins, middlewares). DO NOT bring case-specific concepts/api into the design of the library, the library is meant to be generic

# Coding workflow

- **ALWAYS** make sure typechecking passed, for both src code and tests code, to the directory you are working on
- **NEVER** use comment on code, code should be well named so the content explains for themseleves
- ALWAYS use pnpm, read to understand the project setting before hand
- use linebreak smartly to separate area of code with different meanings

# Concept

<principles>
- the library is designed around the concept of graph resolution. Each node of graph is called "executor".
Executor holds a factory function which can be resolved into value. Executor also hold upstream declaration,
  those will be resolved prior to the Executor.
- node doesn't resolve themselves, they'll be resolve in an unit called "Scope". Scope is in charge of
actualize the graph. Actualization is the process to detect depenedency, resolve each and every in order. By
  default, all values are cached per resolution
- a scope let user update a value of an executor, as the scope knows the upstream and downstream graph,
it'll reinvoke the actualization accordingly. That's called reactivity. However, by default, the reactivity
only happen if a node has a "reactive" upstream. To do that, a node declare to use ".reactive" instead of
just normal one. There's an API for that
- a scope is used for a long running operation, like a server, a cron. It should be there to hold the
reference of long-running resources like database connection, service connections, configs, server
references etc. However, system normally has short-span and long-span operation. Short-span context is
called "pod". A pod is a fork version of scope. Actualization against a pod will copy value already resolved
  from the scope into the computation, and keep everything local at the pod, that'll make the pod isolated
from each others while still be able to reuse resources from the scope. Disposing the pod will not cause any
  side effect to the scope
- a flow is the unit to support short-span operation. Each flow will have a root context, a map like data
structure. Each flow can execute sub-flow, recursively, each execution will create a fork version of root
context so each flow can store its own data. Sub flow can be executed in sequental or parallel mode, the
data context needs to be organized accordingly, as such, the main flow must control all of those sub
executions somehow
- an extension (current called plugin), is the way the library adding extended functionality by allowing
extra cross-cuts to existing functionalities. For example, opening a transaction per pod, log all of
executions, etc
- a meta is decorative information that will be used to.
  + decorate a node (executor)
  + decorate a scope (as the way to pass configuration to resources as well as plugins)
  + decorate a pod/flow (as the way to pass configuration to executions as well as plugins)
</principles>
<benefits>
- graph resolutions make access to any node of the graph easily. User doesn't need to know the whole graph,
they can focus on the node they want
- changing the graph can be easy, given at the time of access, we know the graph. As such, it'll be natural
for testing, we can just swap implemenation with the mock to emulate situations
</benefits>
