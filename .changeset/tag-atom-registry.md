---
"@pumped-fn/lite": minor
---

Add tag and atom registries for automatic tracking

- Add `tag.atoms()` method to query all atoms that use a specific tag
- Add `getAllTags()` function to query all created tags
- Tagged values now include a `tag` reference to their parent Tag
- Uses WeakRef for memory-efficient tracking (tags and atoms can be GC'd)
- Automatic registration when `tag()` and `atom()` are called
