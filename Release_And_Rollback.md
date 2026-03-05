# Release And Rollback Path

## Release Flow

1. Ensure working tree is clean:
   - `git status`
2. Run full validation:
   - `pnpm verify`
3. Build release artifacts:
   - `pnpm package:desktop`
4. Generate artifact manifest with checksums:
   - `pnpm release:manifest`
5. Tag release:
   - `git tag -a v<version> -m "Release v<version>"`
   - `git push origin v<version>`
6. Push release commit:
   - `git push origin main`

One-command local path:
- `pnpm release:prepare`

## Manifest

Release manifests are written to:
- `releases/manifest-<version>-<shortsha>.json`

Each manifest records:
- version/tag/commit/branch/dirty state
- artifact file paths
- artifact SHA-256 checksums

## Rollback Flow

Generate a rollback plan:
- `pnpm rollback:plan <target-ref>`

This produces:
- current commit + target commit
- affected commit summary
- recommended `git revert` sequence

Recommended rollback strategy:
1. Revert commits (avoid force pushes on shared branches).
2. Re-run `pnpm verify`.
3. Push rollback commit.

## GitHub Workflow

Use `.github/workflows/release.yml` (`workflow_dispatch`) to run CI-verified release packaging and upload build artifacts.
