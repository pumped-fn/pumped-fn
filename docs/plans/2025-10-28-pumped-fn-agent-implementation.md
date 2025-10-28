# Pumped-fn Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build validation prototype for pumped-fn agent that detects anti-patterns in TypeScript code

**Architecture:** Start with validator core (derive executor), test it thoroughly, then build minimal CLI to prove the concept works

**Tech Stack:** @pumped-fn/core-next, TypeScript, vitest, ast-grep (for AST-based validation)

---

## Task 1: Package Setup

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Modify: `pnpm-workspace.yaml` (add packages/agent)

**Step 1: Create package.json**

Create `packages/agent/package.json`:

```json
{
  "name": "@pumped-fn/agent",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "pumped-agent": "./dist/main.js"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@pumped-fn/core-next": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vitest": "^3.2.4"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/agent/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Verify workspace configuration**

Run: `pnpm -r list --depth -1`
Expected: Should include @pumped-fn/agent in workspace list

**Step 4: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed successfully

**Step 5: Commit**

```bash
git add packages/agent/package.json packages/agent/tsconfig.json
git commit -m "feat(agent): initialize package structure"
```

---

## Task 2: Validator Core - Test Setup

**Files:**
- Create: `packages/agent/tests/validators.test.ts`

**Step 1: Write failing test for Promise constructor detection**

Create `packages/agent/tests/validators.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { codeValidator } from '../src/validators'

describe('codeValidator', () => {
  test('detects Promise constructor anti-pattern', () => {
    const scope = createScope()

    const code = `
      const result = new Promise((resolve) => {
        resolve(42)
      })
    `

    const validator = scope.resolve(codeValidator)
    const violations = validator.checkAntiPatterns(code)

    expect(violations).toContain('ANTI-PATTERN: Promise constructor - use async/await')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/agent test`
Expected: FAIL with "Cannot find module '../src/validators'"

**Step 3: Commit failing test**

```bash
git add packages/agent/tests/validators.test.ts
git commit -m "test(agent): add validator anti-pattern detection test (RED)"
```

---

## Task 3: Validator Core - Implementation

**Files:**
- Create: `packages/agent/src/validators.ts`
- Create: `packages/agent/src/skill-knowledge.ts`

**Step 1: Create skill-knowledge resource**

Create `packages/agent/src/skill-knowledge.ts`:

```typescript
import { provide } from '@pumped-fn/core-next'
import { readFileSync } from 'fs'
import { join } from 'path'

export const skillKnowledge = provide(() => {
  const skillPath = join(process.cwd(), '.claude/skills/pumped-fn/SKILL.md')

  return {
    readSkillFile: () => {
      try {
        return readFileSync(skillPath, 'utf-8')
      } catch (err) {
        return ''
      }
    },
    parsePatterns: (content: string) => {
      return {
        antiPatterns: [
          'new Promise(',
          'provide() with multiple parameters',
          'createScope() outside main/test'
        ]
      }
    }
  }
})
```

**Step 2: Create validator executor**

Create `packages/agent/src/validators.ts`:

```typescript
import { derive } from '@pumped-fn/core-next'
import { skillKnowledge } from './skill-knowledge'

export const codeValidator = derive(
  skillKnowledge,
  (knowledge) => ({
    checkAntiPatterns: (code: string): string[] => {
      const violations: string[] = []

      if (code.includes('new Promise(')) {
        violations.push('ANTI-PATTERN: Promise constructor - use async/await')
      }

      if (code.match(/provide\s*\([^)]*,[^)]*\)/)) {
        violations.push('ANTI-PATTERN: provide() takes no dependencies - use derive()')
      }

      if (code.includes('createScope()') && !code.includes('main.ts') && !code.includes('test.ts')) {
        violations.push('ANTI-PATTERN: createScope() should be in main/test only')
      }

      return violations
    }
  })
)
```

**Step 3: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/agent test`
Expected: PASS (1 test passing)

**Step 4: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/agent typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/agent/src/validators.ts packages/agent/src/skill-knowledge.ts
git commit -m "feat(agent): implement anti-pattern validator (GREEN)"
```

---

## Task 4: Validator - Additional Test Cases

**Files:**
- Modify: `packages/agent/tests/validators.test.ts`

**Step 1: Add test for provide() with dependencies**

Add to `packages/agent/tests/validators.test.ts`:

```typescript
test('detects provide() with dependencies anti-pattern', () => {
  const scope = createScope()

  const code = `
    const myResource = provide(otherDep, (dep) => {
      return { value: dep.value }
    })
  `

  const validator = scope.resolve(codeValidator)
  const violations = validator.checkAntiPatterns(code)

  expect(violations).toContain('ANTI-PATTERN: provide() takes no dependencies - use derive()')
})
```

**Step 2: Add test for createScope() in wrong location**

Add to `packages/agent/tests/validators.test.ts`:

```typescript
test('detects createScope() outside main/test', () => {
  const scope = createScope()

  const code = `
    const scope = createScope()
    export const myFlow = flow({}, () => async (ctx) => {})
  `

  const validator = scope.resolve(codeValidator)
  const violations = validator.checkAntiPatterns(code)

  expect(violations).toContain('ANTI-PATTERN: createScope() should be in main/test only')
})
```

**Step 3: Add test for valid code (no violations)**

Add to `packages/agent/tests/validators.test.ts`:

```typescript
test('returns empty array for valid pumped-fn code', () => {
  const scope = createScope()

  const code = `
    import { flow, provide, derive } from '@pumped-fn/core-next'

    const config = provide(() => ({ port: 3000 }))
    const service = derive(config, (cfg) => ({ port: cfg.port }))
    const myFlow = flow({ service }, ({ service }, input: string) => async (ctx) => {
      return { success: true as const }
    })
  `

  const validator = scope.resolve(codeValidator)
  const violations = validator.checkAntiPatterns(code)

  expect(violations).toHaveLength(0)
})
```

**Step 4: Run tests to verify all pass**

Run: `pnpm -F @pumped-fn/agent test`
Expected: PASS (4 tests passing)

**Step 5: Commit**

```bash
git add packages/agent/tests/validators.test.ts
git commit -m "test(agent): add comprehensive validator test cases"
```

---

## Task 5: Export API

**Files:**
- Create: `packages/agent/src/index.ts`

**Step 1: Create index exports**

Create `packages/agent/src/index.ts`:

```typescript
export { codeValidator } from './validators'
export { skillKnowledge } from './skill-knowledge'
```

**Step 2: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/agent typecheck`
Expected: No errors

**Step 3: Build package**

Run: `pnpm -F @pumped-fn/agent build`
Expected: dist/ directory created with .js and .d.ts files

**Step 4: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): export validator API"
```

---

## Task 6: CLI Prototype - Test

**Files:**
- Create: `packages/agent/tests/main.test.ts`

**Step 1: Write test for CLI validation**

Create `packages/agent/tests/main.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { validateCodeFlow } from '../src/main'

describe('validateCodeFlow', () => {
  test('validates code and returns violations', async () => {
    const scope = createScope()

    const code = `
      const bad = new Promise((resolve) => resolve(1))
    `

    const result = await scope.exec(validateCodeFlow, code)

    expect(result.success).toBe(false)
    expect(result.violations).toHaveLength(1)
  })

  test('validates code and returns success for valid code', async () => {
    const scope = createScope()

    const code = `
      import { provide } from '@pumped-fn/core-next'
      const config = provide(() => ({ port: 3000 }))
    `

    const result = await scope.exec(validateCodeFlow, code)

    expect(result.success).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/agent test`
Expected: FAIL with "Cannot find module '../src/main'"

**Step 3: Commit failing test**

```bash
git add packages/agent/tests/main.test.ts
git commit -m "test(agent): add CLI validation flow test (RED)"
```

---

## Task 7: CLI Prototype - Implementation

**Files:**
- Create: `packages/agent/src/main.ts`

**Step 1: Implement validation flow**

Create `packages/agent/src/main.ts`:

```typescript
import { flow, createScope } from '@pumped-fn/core-next'
import { codeValidator } from './validators'

export const validateCodeFlow = flow(
  { validator: codeValidator },
  ({ validator }, code: string) => async (ctx) => {
    const violations = await ctx.run('validate-anti-patterns', () => {
      return validator.checkAntiPatterns(code)
    })

    if (violations.length > 0) {
      return {
        success: false as const,
        violations,
        message: 'Code violates pumped-fn patterns'
      }
    }

    return {
      success: true as const,
      violations: [],
      message: 'Code follows pumped-fn patterns'
    }
  }
)

async function main() {
  const scope = createScope()

  const testCode = `
    const bad = new Promise((resolve) => resolve(1))
  `

  const result = await scope.exec(validateCodeFlow, testCode)

  console.log('Validation result:', result)

  if (!result.success) {
    console.error('Violations found:')
    result.violations.forEach(v => console.error(`  - ${v}`))
    process.exit(1)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
```

**Step 2: Run tests to verify they pass**

Run: `pnpm -F @pumped-fn/agent test`
Expected: PASS (6 tests total)

**Step 3: Verify typecheck passes**

Run: `pnpm -F @pumped-fn/agent typecheck`
Expected: No errors

**Step 4: Test CLI manually**

Run: `pnpm -F @pumped-fn/agent build && node packages/agent/dist/main.js`
Expected: Output showing violations detected

**Step 5: Commit**

```bash
git add packages/agent/src/main.ts
git commit -m "feat(agent): implement validation CLI flow (GREEN)"
```

---

## Task 8: Documentation

**Files:**
- Create: `packages/agent/README.md`

**Step 1: Create README**

Create `packages/agent/README.md`:

```markdown
# @pumped-fn/agent

Pumped-fn code validator that detects anti-patterns in TypeScript code.

## Status

**Prototype** - Validates basic anti-patterns using string matching.

## Usage

### Programmatic

\`\`\`typescript
import { createScope } from '@pumped-fn/core-next'
import { codeValidator } from '@pumped-fn/agent'

const scope = createScope()
const validator = scope.resolve(codeValidator)

const violations = validator.checkAntiPatterns(code)
if (violations.length > 0) {
  console.error('Anti-patterns found:', violations)
}
\`\`\`

### CLI

\`\`\`bash
pnpm -F @pumped-fn/agent build
node packages/agent/dist/main.js
\`\`\`

## Detected Anti-Patterns

- `new Promise()` constructor (use async/await)
- `provide()` with dependencies (use derive())
- `createScope()` outside main.ts/test files

## Architecture

- `skill-knowledge.ts` - provide() executor reading SKILL.md
- `validators.ts` - derive() executor for pattern checking
- `main.ts` - flow() executor orchestrating validation

## Testing

\`\`\`bash
pnpm -F @pumped-fn/agent test
pnpm -F @pumped-fn/agent typecheck
\`\`\`

## Next Steps

- AST-based validation (replace regex with ast-grep)
- Flow signature validation
- Integration with Claude agent SDK
\`\`\`

**Step 2: Commit**

```bash
git add packages/agent/README.md
git commit -m "docs(agent): add package README"
```

---

## Verification

**Run all checks:**

```bash
# Typecheck
pnpm -F @pumped-fn/agent typecheck

# Tests
pnpm -F @pumped-fn/agent test

# Build
pnpm -F @pumped-fn/agent build

# Manual CLI test
node packages/agent/dist/main.js
```

**Expected:**
- Zero type errors
- 6 tests passing
- Build successful
- CLI detects violations

---

## Next Phase

After prototype validation works:

1. Replace string matching with AST-based validation (ast-grep)
2. Add flow signature validation
3. Integrate Claude agent SDK for interactive validation
4. Build brainstorming workflow integration
