# Contributing to apitrail

Thanks for your interest. apitrail is in alpha — feedback and PRs are very welcome.

## Getting started

```bash
git clone https://github.com/osharim/apitrail.git
cd apitrail
pnpm install
pnpm -r build
pnpm -r test
```

Requires **Node ≥ 20** and **pnpm ≥ 10** (we use pnpm workspaces + Turborepo).

## Layout

```
apitrail/
├── packages/
│   ├── apitrail/     core — register(), OTEL processor, body capture, masking, auto-instrument
│   ├── postgres/     @apitrail/postgres — Postgres storage adapter
│   ├── cli/          @apitrail/cli — install wizard, init, status, drop
│   ├── studio/       @apitrail/studio — standalone dashboard (Hono + Vite + React)
│   └── dashboard/    @apitrail/dashboard — embeddable Next.js Server Components
├── apps/
│   └── example/      reference Next.js 15 app used for end-to-end testing
├── docs/             user-facing docs (STUDIO_SETUP, images/)
├── INTEGRATING.md    canonical config + setup reference
├── AGENTS.md         for AI agents working on the repo
├── SECURITY.md       threat model + built-in controls
├── RELEASE.md        npm publish flow
└── llms.txt          structured LLM index
```

## Development loop

```bash
# Watch-build the core package
pnpm --filter apitrail dev

# In another terminal: run the example app
pnpm --filter example dev
# → http://localhost:3100
```

Useful filters:

```bash
pnpm --filter @apitrail/studio dev             # Hot-reloading studio UI + server
pnpm --filter @apitrail/postgres test          # Just the adapter tests
pnpm --filter apitrail test --watch             # Core tests in watch mode
```

## Before opening a PR

```bash
pnpm lint          # Biome — strict rules, must be clean
pnpm typecheck     # TS strict across every package
pnpm -r test       # 101+ tests across the monorepo
pnpm -r build      # ESM + CJS + DTS for every publishable package
```

All four must pass. CI re-runs them plus `publint` and `@arethetypeswrong/cli` on every push.

Add a changeset describing what changed:

```bash
pnpm changeset
```

Pick the affected package(s) and a bump type. Commit the generated `.changeset/*.md` with your code.

## Conventions

### Commit style

Conventional Commits. Examples:

- `feat(core): add sampling config`
- `fix(processor): handle missing http.target attribute`
- `feat(studio): live tail over SSE`
- `docs(readme): update comparison table`

Include a `!` after the type (`feat(core)!: …`) for breaking changes — we're pre-1.0 so this is OK, but be deliberate.

### Code style

- **Biome** for lint + format (`pnpm biome check --write`).
- TypeScript **strict mode** with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
- ESM-first; dual CJS for libraries via tsup.
- Imports use `.js` extension (TS rewrites them). Type-only imports must use `import type`.
- **No `any`.** Biome rule is `error`. Use `unknown` and narrow.
- **Factory functions** over classes for library surface (see `createSpanProcessor`, `createBatchQueue`).
- **Named exports only** from library entry points.

### Testing

- Vitest everywhere.
- Keep unit tests fast — each package test run should be < 1 s.
- End-to-end verification runs against a real Supabase via `apps/example/scripts/verify-postgres.mjs`.

### Adding a new storage adapter

1. Copy `packages/postgres/` as a starting point.
2. Export a factory returning the `StorageAdapter` contract:
   ```ts
   export interface StorageAdapter {
     name: string
     insertBatch: (entries: SpanEntry[]) => Promise<void> | void
     shutdown?: () => Promise<void> | void
   }
   ```
3. Lazy-load any Node-only driver (like `pg` is lazy-loaded now) so the factory stays edge-safe for top-level imports in `instrumentation.ts`.
4. Reject dangerous inputs at construction time — see `quoteIdent` in `packages/postgres/src/schema.ts`.
5. Swallow adapter errors via `onError`, never throw from `insertBatch` (would kill the span processor).
6. Add a README + tests + an entry in the monorepo [README's packages table](./README.md#-packages).

### Danger zones

- **`packages/apitrail/src/capture.ts` monkey-patches `globalThis.Request` and `globalThis.Response`.** Breaking changes here ripple into every downstream Next.js app. Always add a test in `apps/example/` when touching this file.
- **OTEL span shape** differs between minor versions of `@opentelemetry/sdk-trace-base`. `span.parentSpanId` exists in 1.x; newer versions moved to `span.parentSpanContext?.spanId`. Keep a fallback.
- **`instrumentation.ts` runs in both Node and Edge runtimes.** Gate Node-only code behind `process.env.NEXT_RUNTIME !== 'edge'` and avoid static references to `process.once` / `process.stdout` (Turbopack's Edge analyser flags them). Use the dynamic-import-from-separate-module pattern (see `shutdown.ts`).

## Reporting bugs / requesting features

Open an issue with the appropriate template. For bugs, please include:

- Next.js version
- Node.js version
- Runtime (Node / Edge)
- Minimal reproduction or a link to a repo

For security issues, **do not** open a public issue — see [SECURITY.md](./SECURITY.md).

## Release

See [RELEASE.md](./RELEASE.md) for the `pnpm publish -r` flow and NPM_TOKEN setup. The short version:

```bash
pnpm changeset                # describe the change
pnpm changeset version        # bump versions
pnpm -r build
pnpm publish -r --access public --tag alpha --no-git-checks
```

**Always** `pnpm publish -r` — never `npm publish` per package. pnpm resolves `workspace:*` at publish time; `npm` does not, and the leak breaks `pnpm dlx`.

## License

By contributing, you agree your contributions are licensed under the [MIT License](./LICENSE).
