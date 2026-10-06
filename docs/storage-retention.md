# Workspace storage and retention

Cleanup on 2026-10-06 reduced the workspace from **43.47 GiB to 3.54 GiB**, a 91.9% reduction in logical file size. Actual drive free space increased by **37.37 GiB**; some removed dependency copies shared disk data through links.

| Location | Before | After | Retained |
| --- | --- | --- | --- |
| `.local/backups` | 14.62 GB | 205 MB | Verified compact migration snapshot and current source snapshot |
| `.local/legacy` | 13.92 GB | 1.34 GB | Source, worktrees, Git history, research and original legacy archive |
| `releases` | 16.29 GB | 1.53 GB | Latest complete release, one compressed rollback, historical APKs and records |
| `artifacts` | 1.05 GB | 10 MB | Logs, validation reports, previews and fixtures |
| `node_modules` | 641 MB | 641 MB | Maintained application's dependencies for continued development |

The table uses decimal GB/MB; the workspace totals use GiB, as in Windows size displays. Reparse links were excluded from recursive measurements and deletion never traversed their targets.

## Releases

`releases/2026-10-06-handwriting-responsiveness` remains complete, including Windows/Linux apps and archives, Android APK, independent web, checksums and validation evidence. Its 518 checksummed files were verified before and after cleanup.

`releases/2026-10-04-notebook-performance` retains the four verified 0.1.15 rollback packages: Windows ZIP, Linux tarball, independent-web ZIP and Android APK, plus original records. Extract the archives to run a rollback; its unpacked platform folders were removed.

Older release folders retain Android APKs, signing instructions, checksums, validation records and previews. Superseded desktop/web binaries and duplicate unpacked folders were removed. Each affected release has `ARCHIVED.md` and `RETENTION.json`; original instructions and manifests describe the historical complete delivery.

Keep the newest complete delivery and one previous compressed rollback. After verifying a new release, remove superseded desktop/web packages and duplicate staging copies. Preserve historical APKs and small verification records. Do not accumulate both unpacked and compressed desktop copies for every version.

## Backups and legacy research

The former 14.5 GB full-workspace backup is replaced by `.local/backups/Slate-before-restructure-source-20261006.zip` (184 MB). All 6,006 retained entries were verified against the original snapshot and checked again after writing. It preserves original source, Git data, configuration, unique assets, historical APKs and records while omitting generated caches and desktop/web packages.

The original `.local/legacy/legacySlateV1.rar` remains intact at 1.3 GB and is stored once. Its SHA-256 matches the original snapshot; the compact backup manifest records it as an external retained file. Include this RAR when copying the compact backup elsewhere. Legacy dependencies, `dist` and Rust `src-tauri/target` directories were removed; source and research remain.

`.local/backups/Slate-current-source-20261006.zip` (20 MB) preserves the dirty maintained checkout and Git/history metadata immediately before cleanup. All 3,535 file hashes were verified. Existing local signing/configuration files present in the workspace were included. The targeted handwriting source backup also remains.

Future source snapshots should exclude dependencies, compiler output, build caches, staging packages and duplicate release binaries. Preserve source, Git history, local configuration, signing material and unique user/research files. Store original large archives once and record their hashes and retained locations. Keep backups and signing material out of Git.

## Development and verification

The root dependency installation remains, and all application source is preserved. Cleared `dist`, desktop staging and Android build outputs are recreated by the existing root build/package commands. Generated test data can be recreated; retained fixtures and reports remain available.

Immediately after cleanup, 5,616 protected source/history/archive/APK files passed hash comparisons, along with the latest release and all four rollback packages. No application rebuild was necessary for this filesystem cleanup. Source and Git data were backed up before deletion. Only storage documentation was updated afterward.

Local reports are `.local/storage-before.json`, `.local/storage-after.json`, `.local/storage-cleanup.json` and the backup verification JSON files. Current application data in external vaults and platform profiles was outside the cleanup scope.
