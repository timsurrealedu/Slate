# Repository layout and history

The shared application, native Android project, desktop helpers and workspace packages live at the repository root. The former version and development-tool wrapper directories were removed on 2026-10-04. Build commands run from the root.

## Git history

All three existing application commits were rewritten so their file trees use the current root layout. Commit order, parents, authors, author dates and committer dates were retained. The initial commit title now names Slate. Duplicate wrapper ignore files were consolidated, and documentation paths were adjusted to match the layout. Rewriting changes commit IDs.

| Previous commit | Rewritten commit |
| --------------- | ---------------- |
| `6a0820e`       | `6229533`        |
| `1059c57`       | `12d9370`        |
| `58af364`       | `06bed0f`        |

The existing uncommitted 0.1.12 work was captured in a separate commit before repository housekeeping. Legacy prototype history remains in its own local repository and is separate from the maintained application's history.

## Local retention

- `.local/backups/` contains the complete ZIP snapshot made before the migration, its SHA-256, file manifest and verification record. The snapshot includes Git data, ignored files, dependency links, releases and legacy research.
- `.local/history/original.git/` preserves the original repository metadata. `.local/history/migration.json` contains the complete old-to-new commit map.
- `.local/legacy/` retains the legacy prototype and its worktrees for reference.
- `releases/` retains all existing runnable deliveries byte for byte, including earlier packages. Release manifests and checksums remain intact.
- `artifacts/` is generated build and test staging.

These local folders are excluded from Git. Use the tracked repository tree for source distribution; the full workspace ZIP is a private local backup.

## Graphify

The root `graphify-out/` contains the refreshed application graph, report and interactive HTML. `.graphifyignore` focuses the graph on Slate's application, native platforms, tests and documentation. Inherited template packages and bundled third-party assets remain in the source tree but are excluded from this graph. Generated caches and machine-specific interpreter paths are ignored by Git.

## GitHub

The `main` branch is prepared for a new GitHub repository. No remote was configured in the original workspace. After creating an empty repository, add its URL as `origin` and push `main` with `git push -u origin main`. Use the prepared history when making the first push.

The CI workflow uses GitHub-hosted Windows and Linux runners for typechecking, application lint, unit tests, the independent build and production browser tests.
