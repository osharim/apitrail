# AGENTS.md

Instructions for AI coding agents working on the apitrail repo itself. For agents **integrating apitrail into another project**, see [INTEGRATING.md](./INTEGRATING.md) instead.

## What this repo is

A TypeScript monorepo that publishes five npm packages:

| Package | npm | Purpose |
|---|---|---|
| `apitrail` | [apitrail](https://www.npmjs.com/package/apitrail) | Core: `register()`, OTEL processor, body capture, masking, auto-instrument |
| `@apitrail/postgres` | [@apitrail/postgres](https://www.npmjs.com/package/@apitrail/postgres) | Postgres storage adapter (edge-safe, lazy-loads `pg`) |
| `@apitrail/cli` | [@apitrail/cli](https://www.npmjs.com/package/@apitrail/cli) | `apitrail install / init / status / drop` |
| `@apitrail/studio` | [@apitrail/studio](https://www.npmjs.com/package/@apitrail/studio) | Standalone dev dashboard (Hono + Vite + React) |
| `@apitrail/dashboard` | [@apitrail/dashboard](https://www.npmjs.com/package/@apitrail/dashboard) | Embeddable Next.js Server Component UI |

## Layout

```
apitrail/
├── packages/
│   ├── apitrail/          # core (entry: src/index.ts)
│   ├── postgres/          # adapter (entry: src/index.ts, schema via /schema subpath)
│   ├── cli/               # CLI (entry: src/cli.ts, commands in commands/)
│   ├── studio/            # standalone dashboard (Hono server + Vite SPA)
│   └── dashboard/         # embeddable RSC UI (entry: src/index.tsx)
├── apps/
│   └── example/           # Next.js 15 reference app — do NOT break this
├── docs/
│   ├── STUDIO_SETUP.md    # studio deployment walkthrough
│   └── images/            # hero screenshot, etc.
├── .github/workflows/     # CI (ci.yml) + release (release.yml)
├── tsconfig.base.json     # shared compiler options
├── tsconfig.lib.json      # shared lib-package tsconfig
├── biome.json             # lint + format
├── turbo.json             # task graph
└── pnpm-workspace.yaml
```

Key source files by subsystem:

| Subsystem | File |
|---|---|
| Public config shape | `packages/apitrail/src/types.ts` |
| Config defaults + resolution | `packages/apitrail/src/config.ts` |
| OTEL span → SpanEntry conversion | `packages/apitrail/src/processor.ts` |
| Monkey-patches (Request / Response) | `packages/apitrail/src/capture.ts` |
| PII masking + query-string stripping | `packages/apitrail/src/mask.ts` |
| Auto-detection of OTEL instrumentations | `packages/apitrail/src/auto-instrument.ts` |
| Batched writes | `packages/apitrail/src/queue.ts` |
| Studio server + APIs | `packages/studio/src/server/` |
| Studio UI | `packages/studio/src/ui/` |
| Install wizard | `packages/cli/src/commands/install.ts` |
| CLI command router | `packages/cli/src/cli.ts` |

## Canonical commands

Use `pnpm`, never `npm` or `yarn`. All tasks run from the repo root.

```bash
pnpm install          # install everything
pnpm -r build         # build every package
pnpm -r test          # run all tests (vitest)
pnpm lint             # biome check (strict — errors must be zero)
pnpm typecheck        # TS strict check
pnpm -r clean         # wipe dist/ and .turbo/
```

## Conventions (enforced by biome + tsconfig)

- **ESM-first** with dual CJS output via tsup. All imports use `.js` extension (even for `.ts` sources) — e.g. `import { foo } from './foo.js'`.
- **`verbatimModuleSyntax: true`** — `import type` is mandatory for type-only imports.
- **`noUncheckedIndexedAccess`** — handle `T[K] | undefined` at access sites.
- **No `any`** — biome rule is `error`. If you must, use `unknown` and narrow.
- **Factory functions over classes** for lib surface. See `createBatchQueue` / `createSpanProcessor`.
- **Named exports only.** No `export default` from library entry points (dashboard's `Dashboard` re-exports default for page convenience only).
- **Quotes: single.** Semicolons: only when needed. Trailing commas everywhere.

## Before you commit

```bash
pnpm lint && pnpm typecheck && pnpm -r build && pnpm -r test
```

All four must pass. CI runs these plus `publint` and `@arethetypeswrong/cli` on every PR.

## Adding a new storage adapter (`@apitrail/mongodb`, etc.)

1. `mkdir -p packages/mongodb/{src,test}` and copy `packages/postgres/package.json` as a starting point.
2. Export a function that returns a `StorageAdapter` (see `packages/apitrail/src/types.ts`).
3. Required contract:
   ```ts
   export interface StorageAdapter {
     name: string
     insertBatch: (entries: SpanEntry[]) => Promise<void> | void
     shutdown?: () => Promise<void> | void
   }
   ```
4. Validate inputs (reject SQL-injection-ish identifiers at construction time — see `quoteIdent` in postgres/schema.ts).
5. Handle errors internally via `onError` callback; never let `insertBatch` throw (would kill the span processor).
6. Write tests with a mocked client (see `packages/postgres/test/adapter.test.ts`).

## Publishing

**Always use `pnpm publish -r`, never `npm publish` per package.** npm does not resolve pnpm's `workspace:*` protocol — it leaks literally into the published manifest and breaks installs. This has already bitten us once.

Full flow:

```bash
# 1. Add a changeset describing what changed
pnpm changeset

# 2. Review + commit the generated .changeset/*.md

# 3. Bump versions (applies all pending changesets)
pnpm changeset version

# 4. Build once
pnpm -r build

# 5. Publish — pnpm resolves workspace:* correctly
pnpm publish -r --access public --tag alpha --no-git-checks
```

CI can do 3–5 automatically via `.github/workflows/release.yml` once `NPM_TOKEN` is set.

## Danger zones

- **`packages/apitrail/src/capture.ts` monkey-patches `globalThis.Request.prototype.json/text/formData` and the `Response` constructor.** Breaking changes here ripple into every Next.js app that depends on apitrail. Always write a test in `apps/example/` when you touch this file.
- **OTEL span shape differs between `@opentelemetry/sdk-trace-base` minor versions.** `span.parentSpanId` exists in 1.x; newer versions moved it to `span.parentSpanContext?.spanId`. Keep a fallback.
- **`instrumentation.ts` runs in BOTH Node and Edge runtimes.** Gate Node-only code behind `process.env.NEXT_RUNTIME !== 'edge'` AND avoid static references to `process.once`/`process.stdout` (Turbopack flags them). The pattern is: early-return on edge, then `await import('./node-only-module.js')`.

## Danger zones — UI (dashboard)

- JSX must compile with `jsx: "react-jsx"` (automatic runtime). Files using `ReactElement` return type must `import type { ReactElement } from 'react'`.
- Keep `sideEffects: ["*.css"]` in `@apitrail/dashboard/package.json` so the CSS isn't tree-shaken.
- All queries happen in Server Components with `import 'server-only'` to prevent client bundle leaks.

## Do NOT

- Do not add runtime dependencies to `apitrail` (the core). Every byte ships to every consumer. OTEL + `@vercel/otel` are already a lot.
- Do not re-introduce the `LogEntry` alias. It was removed in the 0.1 refactor; `SpanEntry` is canonical.
- Do not change the table name default from `apitrail_spans` — users have existing schemas.
- Do not bump peer deps (`next`, `react`, `pg`) minor/major without a changeset + an entry in the breaking-changes section of CHANGELOG.

## Useful single-file reads

When you need to understand a subsystem quickly:

| Need | Read |
|---|---|
| Public config surface | `packages/apitrail/src/types.ts` |
| What gets captured | `packages/apitrail/src/processor.ts` + `capture.ts` |
| What goes into Postgres | `packages/postgres/src/schema.ts` + `index.ts` |
| Dashboard queries | `packages/dashboard/src/queries.ts` |
| Studio server endpoints | `packages/studio/src/server/index.ts` |
| Install wizard flow | `packages/cli/src/commands/install.ts` |
| Auto-detected OTEL packages | `packages/apitrail/src/auto-instrument.ts` |
| How `register()` wires things | `packages/apitrail/src/register.ts` |

## Current stats (keep in sync when changing code)

- **101 tests** across the monorepo (49 apitrail + 14 postgres + 7 cli + 21 studio + 10 dashboard).
- **~6 KB gzipped** core package runtime.
- Supported Node runtimes: **≥ 20**. Supported Next.js: **≥ 15**.

## Source of truth for config

`packages/apitrail/src/types.ts` exports `ApitrailConfig`. If you're changing what options users can pass to `defineConfig`, change that file first, then update `resolveConfig` in `config.ts`, then update `INTEGRATING.md` so integrating agents see the new shape.
