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

- `.local/backups/` contains the verified compact migration source snapshot, a current dirty-checkout/Git snapshot, their manifests and verification records. On 2026-10-06 the owner selected compact retention; the former full-workspace ZIP was replaced after hash verification. See [storage retention](storage-retention.md).
- `.local/history/original.git/` preserves the original repository metadata. `.local/history/migration.json` contains the complete old-to-new commit map.
- `.local/legacy/` retains the legacy prototype's source, worktrees, Git history, research and original archive for reference. Generated dependency, frontend and Rust build output was cleared.
- `releases/` retains the latest complete runnable delivery, one previous compressed rollback, historical Android APKs and original validation records. Superseded desktop/web packages and unpacked duplicates were removed. Affected releases contain retention notices; original manifests describe their historical delivery.
- `artifacts/` is generated build and test staging.

These local folders are excluded from Git. Use the tracked repository tree for source distribution; the compact source ZIPs are private local backups. The migration snapshot records the separately retained original legacy RAR by hash; include it when copying that backup elsewhere.

## Graphify

The root `graphify-out/` contains the refreshed application graph, report and interactive HTML. `.graphifyignore` focuses the graph on Slate's application, native platforms, tests and documentation. Inherited template packages and bundled third-party assets remain in the source tree but are excluded from this graph. Generated caches and machine-specific interpreter paths are ignored by Git.

## GitHub

The maintained source repository is [timsurrealedu/Slate](https://github.com/timsurrealedu/Slate), created as a private repository on 2026-10-06. The local `origin` points to it, and `main` preserves the prepared root application history. Dependencies, generated packages, local backups, legacy research and private signing material remain excluded from Git. Runnable deliveries remain in the local `releases/` directory.

The CI workflow uses GitHub-hosted Windows and Linux runners for typechecking, application lint, unit tests, the independent build and production browser tests.
