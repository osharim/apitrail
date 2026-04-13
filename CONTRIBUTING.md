# Contributing to apitrail

Thanks for your interest! This project is in alpha — feedback and contributions are very welcome.

## Getting started

```bash
git clone https://github.com/apitrail/apitrail.git
cd apitrail
pnpm install
pnpm build
pnpm test
```

## Development loop

```bash
# Watch-build the core package
pnpm --filter apitrail dev

# In another terminal: run the example app
pnpm --filter example dev
# → http://localhost:3100
```

## Before opening a PR

1. `pnpm lint` — Biome check
2. `pnpm test` — all tests pass
3. `pnpm typecheck` — no type errors
4. Add a changeset: `pnpm changeset` (describe your change, pick bump type)

## Project structure

- `packages/apitrail/` — core package
- `packages/postgres/` — Postgres storage adapter (planned)
- `apps/example/` — demo Next.js app for manual testing
- `apps/docs/` — documentation site (planned)

## Commit style

We use Conventional Commits. Examples:

- `feat(core): add sampling config`
- `fix(processor): handle missing http.target attribute`
- `docs: clarify edge runtime behavior`

## Code style

- Biome for lint + format (`pnpm format`)
- TypeScript strict mode
- ESM-first with dual CJS build
- No runtime dependencies in the core package when avoidable

## Reporting bugs / requesting features

Open an issue with the appropriate template. Include:

- Next.js version
- Node.js version
- Runtime (Node / Edge)
- Minimal reproduction

## License

By contributing, you agree your contributions are licensed under the MIT License.
