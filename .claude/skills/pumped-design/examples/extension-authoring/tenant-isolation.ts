/**
 * Multi-tenant Isolation Extension
 *
 * Enforces tenant isolation using context propagation through Tag.Store.
 * Demonstrates: Tag system usage, context access, validation patterns.
 *
 * Referenced in: .claude/skills/pumped-design/references/extension-authoring.md
 * Section: Part 3 - Advanced Patterns / Context Propagation
 */

import { tag, custom, extension, type Extension } from '@pumped-fn/core-next'

const tenantIdTag = tag(custom<string>(), { label: 'tenant-id' })

export const tenantIsolationExtension = extension({
  name: 'tenant-isolation',

  wrap: (scope, next, operation) => {
    // Only journal, subflow, parallel have context
    if (operation.kind === 'journal' || operation.kind === 'subflow') {
      const tenantId = operation.context.get(tenantIdTag.key) as string | undefined

      if (!tenantId) {
        return Promise.reject(new Error('Tenant ID required but not found'))
      }

      // Validate tenant ID format
      if (!/^tenant-[a-z0-9]+$/.test(tenantId)) {
        return Promise.reject(new Error(`Invalid tenant ID format: ${tenantId}`))
      }

      // Log access for audit
      const flowName = operation.kind === 'subflow' ? operation.definition.name : 'journal'
      console.log(`[tenant] ${tenantId} executing ${flowName}`)
    }

    return next()
  }
} satisfies Extension.Extension)
