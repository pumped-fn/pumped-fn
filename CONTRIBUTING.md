# Contributing to Pumped Functions

Thank you for your interest in contributing to Pumped Functions! This guide will help you get started with contributing to our monorepo.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and pnpm 10+
- Docker (optional, for testing GitHub Actions locally with `act`)
- Git

### Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build all packages:
   ```bash
   pnpm build
   ```
4. Run tests to ensure everything works:
   ```bash
   pnpm test
   ```

## 📦 Project Structure

This is a pnpm workspace monorepo with the following structure:

```
/
├── packages/
│   ├── next/     - Core library (@pumped-fn/core-next)
│   ├── react/    - React bindings (@pumped-fn/react)
│   ├── extra/    - Full-stack utilities (@pumped-fn/extra)
│   └── cli/      - CLI tool (@pumped-fn/cli)
├── docs/         - Documentation site
├── examples/     - Usage examples
└── tests/        - Cross-package integration tests
```

## 🔄 Development Workflow

### Making Changes

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in the appropriate package(s)

3. Test your changes:
   ```bash
   pnpm test
   pnpm typecheck
   ```

4. Build to ensure everything compiles:
   ```bash
   pnpm build
   ```

### Creating a Changeset

We use [changesets](https://github.com/changesets/changesets) to manage versions and generate changelogs.

1. After making your changes, create a changeset:
   ```bash
   pnpm changeset
   ```

2. Follow the prompts to:
   - Select which packages are affected
   - Choose the version bump type (patch/minor/major)
   - Write a summary of your changes

3. Commit the generated changeset file along with your changes

**Note**: Not all PRs require changesets. Skip creating one for:
- Documentation changes
- CI/build configuration updates
- Tests that don't change functionality
- Changes marked with `[skip-changeset]` in the PR title

### Submitting a Pull Request

1. Push your branch to your fork
2. Create a pull request to the `main` branch
3. Fill out the PR template with relevant information
4. Wait for the CI checks to pass
5. Request review from maintainers

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode for a specific package
cd packages/next
pnpm test:watch

# Run type checking
pnpm typecheck
```

### Testing GitHub Actions Locally

We use [act](https://github.com/nektos/act) to test GitHub Actions workflows locally:

```bash
# Test CI workflow
pnpm test:ci

# Test release workflow (requires .secrets file)
pnpm test:release

# Test docs deployment
pnpm test:docs
```

To set up secrets for local testing:
1. Copy `.secrets.example` to `.secrets`
2. Fill in your NPM token (only needed for release testing)

## 📝 Code Style

We use [Ultracite](https://github.com/ultracite/ultracite) for code formatting and linting:

```bash
# Format all files
pnpm format

# Check linting without making changes
pnpm lint:check

# Fix linting issues
pnpm lint

# Check both formatting and linting
pnpm format:check
```

## 🚀 Release Process

Releases are handled automatically by GitHub Actions when changes are merged to `main`:

1. When PRs with changesets are merged, a "Version Packages" PR is automatically created
2. This PR updates package versions and changelogs
3. Merging the Version Packages PR triggers:
   - Publishing to npm
   - Creating GitHub releases
   - Deploying updated documentation

### Manual Release (Maintainers Only)

If needed, maintainers can trigger a manual release:

```bash
# Create versions and changelogs
pnpm changeset:version

# Publish to npm
pnpm changeset:publish
```

## 📚 Documentation

### Running Documentation Site Locally

```bash
pnpm docs:dev
```

Visit http://localhost:3000 to view the documentation.

### Writing Documentation

- Documentation is located in the `docs/` directory
- Follow the existing structure and style
- Include code examples where appropriate
- Update the navigation in `docs/src/components/Navigation.tsx` if adding new pages

## 🤝 Community

- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/pumped-fn/pumped-fn/issues)
- **Discussions**: Join conversations in [GitHub Discussions](https://github.com/pumped-fn/pumped-fn/discussions)
- **Security**: Report security vulnerabilities privately to the maintainers

## 📋 Useful Commands Reference

```bash
# Development
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm typecheck      # Type check all packages
pnpm format         # Format code with Ultracite
pnpm lint           # Fix linting issues with Ultracite
pnpm verify         # Build, test, and typecheck

# Changesets
pnpm changeset              # Create a changeset
pnpm changeset:status       # Check changeset status
pnpm changeset:version      # Update versions
pnpm changeset:publish      # Publish packages

# Documentation
pnpm docs:dev       # Run docs dev server
pnpm docs:build     # Build documentation

# Testing GitHub Actions Locally
pnpm test:ci        # Test CI workflow
pnpm test:release   # Test release workflow
pnpm test:docs      # Test docs workflow
```

## 📄 License

By contributing to Pumped Functions, you agree that your contributions will be licensed under the MIT License.