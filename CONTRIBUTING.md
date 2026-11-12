# Contributing to tiny-expr-parser

Thanks for your interest in contributing! Issues and pull requests are both welcome.

## Setup

- **Node.js 24** (see `.nvmrc`)
- **Yarn** 1.x as the package manager

```bash
git clone git@github.com:peakchen90/tiny-expr-parser.git
cd tiny-expr-parser
yarn install
```

## Development

```bash
yarn start   # watch build
yarn test    # run tests (vitest)
yarn lint    # eslint, zero warnings allowed
yarn typecheck
yarn format  # prettier
```

Before opening a PR, make sure `yarn lint`, `yarn format:check`, `yarn typecheck` and `yarn test` all pass.

## Guidelines

- Keep the library zero-dependency and runtime-agnostic; new features should not force an evaluation step — `tiny-expr-parser` parses only.
- Add tests for every change, including error cases.
- Follow the existing code style (enforced by ESLint and Prettier).
- Use [conventional commit messages](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `docs:`, `chore:`).

## Releasing

Releases are published automatically by GitHub Actions when a `v*` tag is pushed:

```bash
npm version patch   # or minor / major
git push --follow-tags
```

The release workflow runs the full test suite, builds the package, and publishes it to npm (requires the `NPM_TOKEN` secret).
