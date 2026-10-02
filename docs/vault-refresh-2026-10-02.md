# Vault refresh after external deletion

The vault scan previously appended every cached folder that was absent from the scan. This kept externally deleted folders in the sidebar; a later reload loaded the same stale database entries again. Application startup also read the cache without rescanning the connected folder.

A successful scan now marks missing physical folders and source documents as `vaultMissing` in the cache. Workspace loading excludes these entries; the cache and note history remain stored. Returning paths reuse their cached IDs and become visible again. Source-less local/imported records are retained. Scans that omit hidden paths do not mark those paths missing. A failed scan does not reconcile missing items, preserving offline/failure behavior.

Application startup refreshes a connected vault before restoring document tabs. If folder access fails, cached content remains available and Slate reports the error. For changes made while Slate is already open, use Open vault > Refresh vault files, or restart Slate. Continuous filesystem watching is not implemented.

Validation: TypeScript and 37 unit tests, including external deletion of empty/nested folders, reload, preserved cached content, hidden scan exclusions, returning paths and failed scans. Packaged Windows native vault smoke also removes a folder externally and verifies it disappears on the next launch. Android 0.1.3/versionCode 4 assembles and passes signature/embedded asset checks; device runtime remains unverified. Linux is packaged on Windows and has not been run on Linux.

Packages: `releases/2026-10-02-vault-refresh`. The real `Documents/Obsidian Vault` was inspected read-only: its visible directories were Personal, TODO and University. No changes were made to that vault or the user's Slate profile.
