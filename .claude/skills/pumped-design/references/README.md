# Pumped-Design Sub-skills

This directory contains sub-skills loaded on-demand by the main pumped-design skill.

## Structure

Each sub-skill has:
- **YAML frontmatter** - name, tags, description (AI reads first)
- **Content sections** - When to use, code templates, examples, troubleshooting

## Usage

AI loads sub-skills based on user query:
1. Scans main SKILL.md routing table
2. Reads sub-skill frontmatter to assess relevance
3. Loads full content if applicable
4. Applies patterns to user's code

## Sub-skills

- `coding-standards.md` - Mandatory before writing code
- `resource-*.md` - Resource construction patterns
- `flow-*.md` - Flow orchestration and context
- `integration-*.md` - Framework integration
- `testing-*.md` - Testing strategies
- `extension-basics.md` - Cross-cutting concerns
- `entrypoint-patterns.md` - Application entry points
