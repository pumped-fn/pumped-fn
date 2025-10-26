# Changelog

All notable changes to the pumped-fn Claude Code plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-10-26

### Added
- Pre-packaged ZIP files for claude.ai web upload
  - `pumped-fn-typescript.zip` - Backend/core patterns skill
  - `pumped-fn-react.zip` - React frontend patterns skill
- Support for web version skill installation (in addition to CLI plugin install)

### Changed
- Distribution now supports both CLI (`/plugin` command) and web (ZIP upload) installation methods

## [1.1.0] - 2025-10-25

### Added
- **pumped-fn-react** skill (v1.0.0) with comprehensive validation
  - React app architecture patterns (Resource Layer, Feature State, UI Projection)
  - Type inference patterns with `Core.InferOutput<T>`
  - Scope management via `ScopeProvider`
  - Testing strategies for React components
  - Validation rounds documentation

### Changed
- **pumped-fn-typescript** skill updated to v3.3.0
  - Added "Two Clear Patterns" section for flow creation
  - Inference-based pattern for simple cases
  - Schema-based pattern for RPC/isomorphic use cases
  - Clarified when to use each pattern

## [1.0.0] - Initial Release

### Added
- **pumped-fn-typescript** skill (v3.2.0)
  - Auto-activation when detecting `@pumped-fn/core-next`
  - 3-tier pattern enforcement (Critical/Important/Best Practices)
  - Critical anti-patterns detection (Multiple Scopes, Built-ins in Resources, Premature Escape)
  - Architecture decision guide
  - Scope lifecycle patterns
  - Implementation reference
  - Testing strategy matrix
- Plugin metadata for marketplace distribution
- Comprehensive README and pattern reference documentation

[1.2.0]: https://github.com/lagz0ne/pumped-fn/releases/tag/plugin-v1.2.0
[1.1.0]: https://github.com/lagz0ne/pumped-fn/releases/tag/plugin-v1.1.0
[1.0.0]: https://github.com/lagz0ne/pumped-fn/releases/tag/plugin-v1.0.0
