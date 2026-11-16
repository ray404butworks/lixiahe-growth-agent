# AGENTS.md

## Project Overview

Lixiahe Growth Agent is a Next.js workspace for sales imports, operating metrics, diagnosis, marketing drafts, and reports. The upstream data utilities remain available in the standalone `csv-charts-ai` package.

## Commands

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build (Next.js)
pnpm lint             # Run ESLint
pnpm lint:fix         # Auto-fix lint + prettier issues
pnpm typecheck        # TypeScript type checking (tsc --noEmit)

# Package (csv-charts-ai)
cd packages/csv-charts-ai
pnpm build            # Build package with tsup
pnpm test             # Run Vitest tests
pnpm test:watch       # Run tests in watch mode
```

## Before Committing

Always run before committing to catch issues early:

```bash
pnpm lint             # Must pass with 0 errors
pnpm build            # Must compile successfully (includes TypeScript check)
```

The project uses prettier via eslint (`prettier/prettier` rule). Use `pnpm lint:fix` to auto-format.

## Architecture

- **Workspace** in `src/app/` and `src/styles/`. The shared client workspace owns imported rows, filters, and navigation for the current session.
- **Data** in `src/lib/growth/`. Preserve existing import validation and exact decimal calculations. The browser uses PapaParse for CSV and `csv-charts-ai/tabular` for shared parsing helpers and Excel.
- **Local API** in `src/lib/agent/`. `scripts/serve-preview.mjs` serves the static export and bundled API. Diagnosis and marketing generation use local rules by default. Authorized model requests run through the local service.
- **Shared package** in `packages/csv-charts-ai/`. Preserve its existing public imports and optional providers when changing the app-specific parsing entry.
- **Validation** uses Vitest and the desktop/mobile Playwright project in `e2e-growth/`. Build the shared package before app type checking on a fresh checkout.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
