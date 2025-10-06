# Documentation Rebuild - Detailed Task Breakdown

## Epic: Rebuild Documentation for API Changes

### Recent API Changes to Address
- `success` → `output` rename in flow results
- `FlowExecutionContext` → `flowMeta`
- Added `scope.exec()` method
- Flow execution `details` option
- Journal migrated to accessor-based API
- Plugin → Extension rename
- Pod nesting capability
- Eliminated `any` types across codebase

---

## Phase 1: Foundation & Infrastructure (Priority: Critical)

### Task 1.1: Restore VitePress Configuration
**Epic**: Infrastructure
**Story**: VitePress Setup
**Priority**: P0 - Blocker
**Effort**: 2h

**Description**: Restore deleted `.vitepress/config.ts` with updated navigation structure

**Acceptance Criteria**:
- [ ] `.vitepress/config.ts` recreated
- [ ] Navigation reflects new doc structure
- [ ] Twoslash integration configured
- [ ] Mermaid plugin configured
- [ ] Build succeeds without errors
- [ ] Dev server runs successfully

**Implementation Details**:
- Restore config from git history
- Update sidebar navigation for new structure
- Configure theme and search
- Test all plugins (twoslash, mermaid)

---

### Task 1.2: Update Code Examples Infrastructure
**Epic**: Infrastructure
**Story**: Example Code Setup
**Priority**: P0 - Blocker
**Effort**: 3h

**Description**: Update all code example files with new API terminology

**Acceptance Criteria**:
- [ ] All examples use `output` instead of `success`
- [ ] `flowMeta` replaces `FlowExecutionContext`
- [ ] Examples compile without errors
- [ ] Twoslash annotations work
- [ ] Type inference displays correctly

**Files to Update**:
- `docs/code/1-minute.ts`
- `docs/code/5-minutes.ts`
- `docs/code/10-minutes.ts`
- `docs/code/testing-graph-unified.ts`
- All other code snippets

---

## Phase 2: Core Documentation Updates (Priority: High)

### Task 2.1: Update index.md (Landing Page)
**Epic**: Core Docs
**Story**: Landing Page
**Priority**: P1 - High
**Effort**: 4h

**Description**: Rebuild landing page with current API and principles

**Acceptance Criteria**:
- [ ] Quick start uses current API
- [ ] All code examples use `output` terminology
- [ ] Benefits section updated
- [ ] Installation steps current
- [ ] Navigation links work
- [ ] Progressive disclosure maintained

**Content Updates**:
- Update "Graph Resolution in Action" examples
- Modernize "How Graph Resolution Works"
- Update "Testing Revolution" examples
- Refresh "Documentation" navigation table

---

### Task 2.2: Update api.md (Complete API Reference)
**Epic**: Core Docs
**Story**: API Reference
**Priority**: P1 - High
**Effort**: 8h

**Description**: Comprehensive update of all API documentation

**Acceptance Criteria**:
- [ ] Flow API uses `output` instead of `success`
- [ ] `flowMeta` documented (not `FlowExecutionContext`)
- [ ] `scope.exec()` method documented
- [ ] `details` option documented
- [ ] Extension API (not plugin) terminology
- [ ] Accessor integration examples added
- [ ] All type signatures current

**Sections to Update**:
1. Graph Construction (minimal changes)
2. Graph Resolution - add `scope.exec()`
3. Extensions (was "plugins") - rename throughout
4. Meta (minimal changes)
5. Flow API - major updates for new APIs

---

### Task 2.3: Update how-does-it-work.md
**Epic**: Core Docs
**Story**: Fundamentals
**Priority**: P1 - High
**Effort**: 6h

**Description**: Update fundamentals documentation with latest concepts

**Acceptance Criteria**:
- [ ] Extension terminology (not plugin)
- [ ] Accessor-based journal explained
- [ ] Pod nesting documented
- [ ] `scope.exec()` flow integration
- [ ] All mermaid diagrams current
- [ ] Sequence diagrams updated

**Diagrams to Update**:
- Standard resolution flow
- Extension interception flow
- Update propagation with accessor
- Pod creation with nesting

---

## Phase 3: Advanced Features (Priority: Medium)

### Task 3.1: Update flow.md (Flow API Deep Dive)
**Epic**: Advanced Features
**Story**: Flow System
**Priority**: P1 - High
**Effort**: 6h

**Description**: Complete Flow API documentation update

**Acceptance Criteria**:
- [ ] Result type uses `output` not `success`
- [ ] `flowMeta` documented with examples
- [ ] `details` option usage patterns
- [ ] Execution context examples current
- [ ] All handler signatures updated
- [ ] Context API reflects accessor usage

**Key Updates**:
- Flow definition with `output` field
- `flowMeta` accessor patterns
- Details option for execution metadata
- Integration with scope.exec()

---

### Task 3.2: Update accessor.md (DataAccessor Guide)
**Epic**: Advanced Features
**Story**: Accessor System
**Priority**: P2 - Medium
**Effort**: 4h

**Description**: Document accessor patterns and journal migration

**Acceptance Criteria**:
- [ ] Journal migration examples
- [ ] `flowMeta` accessor patterns
- [ ] Context inheritance updated
- [ ] Testing patterns current
- [ ] Integration examples work

**Content Additions**:
- Accessor vs Meta comparison table
- flowMeta usage in extensions
- Journal accessor patterns
- Context propagation examples

---

### Task 3.3: Update extensions.md (Extension System)
**Epic**: Advanced Features
**Story**: Extension System
**Priority**: P1 - High
**Effort**: 5h

**Description**: Complete rename from plugins to extensions

**Acceptance Criteria**:
- [ ] All "plugin" references changed to "extension"
- [ ] Unified scope/flow API documented
- [ ] Pod nesting considerations added
- [ ] All examples use Extension terminology
- [ ] Extension interface updated

**Global Changes**:
- s/plugin/extension/g throughout file
- Update all code examples
- Extension.Extension type usage
- scope.use() vs deprecated plugin()

---

### Task 3.4: Update meta.md (Meta System)
**Epic**: Advanced Features
**Story**: Meta System
**Priority**: P2 - Medium
**Effort**: 3h

**Description**: Clarify Meta vs Accessor usage patterns

**Acceptance Criteria**:
- [ ] Meta vs Accessor comparison clear
- [ ] Use cases well defined
- [ ] Integration examples current
- [ ] Type safety examples work

**Content Updates**:
- Comparison table with Accessor
- When to use Meta vs Accessor
- Immutability emphasis
- Extension integration patterns

---

## Phase 4: Practical Application (Priority: Medium)

### Task 4.1: Update testings.md (Testing Guide)
**Epic**: Practical Guides
**Story**: Testing
**Priority**: P2 - Medium
**Effort**: 4h

**Description**: Update testing strategies for current APIs

**Acceptance Criteria**:
- [ ] Accessor-based testing patterns
- [ ] Pod isolation examples
- [ ] Extension mocking examples
- [ ] All test code compiles

**New Content**:
- Testing with flowMeta accessors
- Pod-based test isolation
- Extension testing patterns
- Graph testing with new APIs

---

### Task 4.2: Update authoring.md (Component Guide)
**Epic**: Practical Guides
**Story**: Component Authoring
**Priority**: P2 - Medium
**Effort**: 3h

**Description**: Update component authoring best practices

**Acceptance Criteria**:
- [ ] Current API usage patterns
- [ ] Extension integration examples
- [ ] Meta vs Accessor guidance
- [ ] Real-world patterns

---

### Task 4.3: Update llm.md (LLM Integration)
**Epic**: Practical Guides
**Story**: LLM Guide
**Priority**: P3 - Low
**Effort**: 2h

**Description**: Update LLM integration guide

**Acceptance Criteria**:
- [ ] Current API references
- [ ] Extension terminology
- [ ] Example code works

---

## Phase 5: Quality Assurance (Priority: High)

### Task 5.1: Validate All Code Examples
**Epic**: QA
**Story**: Code Validation
**Priority**: P1 - High
**Effort**: 4h

**Description**: Ensure all code examples compile and run

**Acceptance Criteria**:
- [ ] All inline code compiles
- [ ] All code snippets compile
- [ ] Twoslash annotations work
- [ ] Type inference correct
- [ ] No any types in examples

**Validation Steps**:
1. Run tsc on all example files
2. Verify twoslash output
3. Test all code snippets
4. Validate type inference

---

### Task 5.2: Documentation Build & Deploy Test
**Epic**: QA
**Story**: Build Validation
**Priority**: P1 - High
**Effort**: 2h

**Description**: Validate complete documentation build

**Acceptance Criteria**:
- [ ] `pnpm docs:build` succeeds
- [ ] No broken links
- [ ] All images load
- [ ] Search index built
- [ ] No console errors
- [ ] Mobile responsive

---

### Task 5.3: Cross-Reference Validation
**Epic**: QA
**Story**: Link Validation
**Priority**: P2 - Medium
**Effort**: 3h

**Description**: Validate all cross-references and links

**Acceptance Criteria**:
- [ ] All internal links work
- [ ] API references correct
- [ ] Code line numbers accurate
- [ ] Navigation consistent

---

## Phase 6: Review & Polish (Priority: Low)

### Task 6.1: Technical Review
**Epic**: Polish
**Story**: Content Review
**Priority**: P2 - Medium
**Effort**: 4h

**Description**: Technical accuracy review

**Acceptance Criteria**:
- [ ] All APIs documented correctly
- [ ] Examples follow best practices
- [ ] No outdated information
- [ ] Terminology consistent

---

### Task 6.2: Progressive Learning Flow Validation
**Epic**: Polish
**Story**: UX Review
**Priority**: P2 - Medium
**Effort**: 3h

**Description**: Validate learning progression

**Acceptance Criteria**:
- [ ] Simple → Complex flow works
- [ ] No prerequisite gaps
- [ ] Examples build on each other
- [ ] Navigation intuitive

---

## Summary Statistics

**Total Tasks**: 18
**Total Effort**: ~66 hours
**Critical Path**: Phase 1 → Phase 2 → Phase 5.1 → Phase 5.2

### Priority Breakdown
- P0 (Blocker): 2 tasks, ~5h
- P1 (High): 8 tasks, ~38h
- P2 (Medium): 7 tasks, ~21h
- P3 (Low): 1 task, ~2h

### Dependency Chain
1. **Start**: Task 1.1 (VitePress Config)
2. **Parallel**: Task 1.2 (Examples) + Task 2.1 (index.md)
3. **Parallel**: All Phase 2 & 3 tasks
4. **Parallel**: All Phase 4 tasks
5. **Sequential**: Phase 5 tasks (QA)
6. **Final**: Phase 6 tasks (Polish)

### Quick Start Execution Order
For immediate progress:
1. Task 1.1 - Restore VitePress (2h) - **BLOCKER**
2. Task 2.2 - Update api.md (8h) - **CORE REFERENCE**
3. Task 3.3 - Update extensions.md (5h) - **TERMINOLOGY FIX**
4. Task 3.1 - Update flow.md (6h) - **API CHANGES**
5. Task 5.1 - Validate examples (4h) - **QUALITY**
6. Task 5.2 - Build test (2h) - **RELEASE**

**Minimum Viable Documentation**: Complete tasks 1.1, 2.1, 2.2, 5.2 (~16h)
