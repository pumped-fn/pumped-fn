# Pumped Fn Documentation

This directory contains the Docusaurus-based documentation website for Pumped Fn.

## Development

1. Install dependencies:
```bash
cd docs
pnpm install
```

2. Start development server:
```bash
pnpm start
```

3. Build for production:
```bash
pnpm build
```

## Structure

- `docs/` - Documentation content (Markdown files)
- `src/` - Custom React components and pages
- `static/` - Static assets (images, etc.)
- `docusaurus.config.js` - Site configuration
- `sidebars.js` - Sidebar navigation structure

## Deployment

The documentation is automatically deployed to GitHub Pages when changes are pushed to the main branch via GitHub Actions.

## Live Code Examples

This documentation uses Docusaurus's live code block feature. You can write interactive React examples using the `live` code block:

````markdown
```tsx live
import React from 'react';
import { provide } from '@pumped-fn/core-next';

function Example() {
  return <div>Interactive example</div>;
}

export default Example;
```
````

## Contributing

When adding new documentation:

1. Follow the existing structure in `sidebars.js`
2. Use live code examples where helpful
3. Include TypeScript types in examples
4. Test interactive examples before submitting