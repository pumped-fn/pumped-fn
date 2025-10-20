---
"@pumped-fn/core-next": patch
---

Complete Meta to Tag migration

BREAKING CHANGE: Meta namespace removed, all metas properties and meta parameters renamed to tags

- Remove Meta namespace entirely
- Rename all metas properties to tags
- Rename all meta parameters to tags
- Rename scopeMeta parameter to scopeTags
- Update all documentation to reflect Tag API
- No backward compatibility
