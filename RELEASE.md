# Release process

`apitrail` uses [Changesets](https://github.com/changesets/changesets) for versioning and a GitHub Actions workflow to publish to npm on each merge to `main`.

## One-time setup

### 1. Create an NPM granular access token

1. Go to <https://www.npmjs.com/settings/USER/tokens/new>
2. Choose **Granular Access Token**
3. Scope: `Read and write`
4. Packages and scopes:
   - Add `apitrail`
   - Add the scope `@apitrail/*` (covers `@apitrail/postgres`, `@apitrail/cli`, `@apitrail/dashboard`, and any future ones)
5. Expiration: 90 days (set a calendar reminder to rotate)
6. Copy the token (starts with `npm_…`) — you will only see it once

### 2. Store it as a GitHub Actions secret

```bash
gh secret set NPM_TOKEN --repo osharim/apitrail
# paste the token when prompted
```

The release workflow at `.github/workflows/release.yml` already references `secrets.NPM_TOKEN`.

### 3. Verify

Push a dummy changeset and merge it — `Changesets` should open a "Version packages" PR automatically.

## Day-to-day flow

1. Work on a feature branch; add a changeset describing the change:
   ```bash
   pnpm changeset
   ```
   Pick the packages that changed, choose the bump type (`patch` / `minor` / `major`), and write a short summary. Commit the generated `.changeset/*.md` file alongside your code.

2. Open a PR. CI runs `lint`, `typecheck`, `build`, `test`, `publint`, and `arethetypeswrong`.

3. Merge the PR to `main`. The `Release` workflow then:
   - Either opens / updates a "Version packages" PR that aggregates all pending changesets into concrete version bumps + a CHANGELOG entry, OR
   - If such a PR is already merged, it publishes the new versions to npm (with provenance) and tags the release on GitHub.

## Manual release (escape hatch)

If the automated workflow is not an option, from a clean checkout of `main`:

```bash
pnpm install --frozen-lockfile
pnpm changeset version   # applies pending changesets
pnpm -r build
pnpm -r publish --access public
git push --follow-tags
```

Requires `npm login` locally with an account that has write access to `apitrail` and `@apitrail/*`.

## First publish (v0.1.0-alpha.0)

The first publish cannot be automated because the packages do not yet exist on the registry and need an initial `npm publish --access public` to create them under your account. See `docs/FIRST_PUBLISH.md` if you create one, or run the manual flow above with `--tag alpha` to keep `latest` pristine.
