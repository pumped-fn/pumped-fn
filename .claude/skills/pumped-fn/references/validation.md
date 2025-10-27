## Validation Checklist

**Purpose:** Ensure zero violations before code delivery. Block delivery if any check fails.

---

### Pre-Generation Checklist

**Before generating ANY code, verify:**

☐ **Architecture map strategy determined**
  - Where will `.pumped-fn/map.yaml` be located?
  - What categories need tracking (resources, flows, api, utils)?
  - Which components are critical (core dependencies)?

☐ **Tags identified for runtime config**
  - What varies between environments (DB host, API keys, feature flags)?
  - Which values come from outside (CLI args, request context, env vars)?
  - Tag definitions planned (custom types, labels)?

☐ **Scope strategy decided**
  - Application type known (HTTP server, CLI, Lambda, React, etc.)?
  - When is scope created (startup, per-command, per-invocation)?
  - When is scope disposed (shutdown, finally, never)?

☐ **Discriminated union outputs planned**
  - All flows return `{ success: true/false, ... }`?
  - Error types enumerated (INVALID_EMAIL, NOT_FOUND, etc.)?
  - Success/error branches type-safe?

☐ **Journaling plan defined**
  - Which operations need ctx.run() keys?
  - Which flows call sub-flows via ctx.exec()?
  - Operation keys meaningful (validate-email, insert-user)?

☐ **Test strategy chosen**
  - Resources: preset() or integration tests?
  - Flows: always preset()?
  - Utilities: direct unit tests?

☐ **Observability extension planned**
  - Logging requirements (basic, structured, LLM-optimized)?
  - Metrics needed (duration, errors, counts)?
  - Tracing required (correlation IDs, distributed traces)?

---

### Post-Generation Checklist

**After generating code, run validation:**

☐ **Type safety verified**
```bash
pnpm tsc --noEmit
# Must pass with ZERO errors
```

☐ **No process.env in executors**
```bash
grep -r "process.env\|import.meta.env" src/resource-*.ts src/flow-*.ts src/repo-*.ts
# Must return ZERO matches
```

☐ **Single scope verified**
```bash
grep -c "createScope()" src/routes/ src/api/ src/handlers/
# Must return 0 (scope created at app level only)

grep -c "createScope()" src/main.ts src/index.ts src/app.ts
# Must return 1 (exactly one scope)
```

☐ **All flows journaled**
```bash
grep -l "flow(" src/flow-*.ts | while read file; do
  if ! grep -q "ctx.run\|ctx.exec" "$file"; then
    echo "Missing journaling: $file"
  fi
done
# Must return ZERO files
```

☐ **Tests use preset (no global mocks)**
```bash
grep -r "vi.mock\|jest.mock" src/**/*.test.ts
# Must return ZERO matches (or very few, with justification)

grep -c "preset(" src/**/*.test.ts
# Should be > 0 (tests use preset for mocking)
```

☐ **Flat structure enforced**
```bash
find src -type d -mindepth 2
# Should return ZERO directories (or <10 files justify subdirs)
```

☐ **Files under 500 lines**
```bash
find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500 { print $2 " has " $1 " lines" }'
# Must return ZERO files
```

☐ **Architecture map updated**
```bash
grep "new-component-pattern" .pumped-fn/map.yaml
# New components reflected in map
```

---

### Runtime Validation Commands

**During development, run these commands frequently:**

**Type checking:**
```bash
pnpm tsc --noEmit
```

**Tests:**
```bash
pnpm test
```

**Build:**
```bash
pnpm build
```

**Verify architecture map:**
```bash
cat .pumped-fn/map.yaml
```

**Check file sizes:**
```bash
find src -name "*.ts" -exec wc -l {} \; | sort -rn | head -10
```

**Check nesting:**
```bash
find src -type f -name "*.ts" | awk -F/ '{print NF-1}' | sort -u
```

---

### Zero Violations Guarantee

**IF ANY validation check fails:**
1. STOP code delivery
2. Fix violations
3. Re-run all checks
4. Only proceed when ALL checks pass

**DO NOT:**
- Deliver code with any type errors
- Commit code with process.env in executors
- Create PR with missing journaling
- Merge code with excessive file sizes
- Ignore validation failures

**Example enforcement:**
```typescript
// Before committing, run validation script:
// scripts/validate.sh

#!/bin/bash
set -e

echo "Running type check..."
pnpm tsc --noEmit

echo "Running tests..."
pnpm test

echo "Checking for process.env in executors..."
if grep -r "process.env" src/resource-*.ts src/flow-*.ts src/repo-*.ts; then
  echo "ERROR: Found process.env in executors"
  exit 1
fi

echo "Checking for missing journaling..."
for file in src/flow-*.ts; do
  if ! grep -q "ctx.run\|ctx.exec" "$file"; then
    echo "ERROR: Missing journaling in $file"
    exit 1
  fi
done

echo "Checking file sizes..."
if find src -name "*.ts" -exec wc -l {} \; | awk '$1 > 500 { exit 1 }'; then
  echo "All files under 500 lines"
else
  echo "ERROR: Files exceed 500 lines"
  exit 1
fi

echo "All validations passed!"
```

---

