# Slate

A local-first workspace for Markdown, linked notes, paged handwriting, PDFs and DOCX. Slate runs offline on Windows, Linux, Android and the web, with no account required.

The maintained application lives at the repository root. The current local release is **0.1.12**. See [release status](docs/release-status.md) for validation evidence and device limitations.

## Features

- Markdown source, live preview and reading, with wiki links, backlinks, tags, Vim, tables and equations.
- Connected folder vaults, nested folders, search, tabs and recoverable Trash.
- Paged notebooks with pressure-aware ink, selection transforms, PDF annotation and touch gestures.
- Saved layout and appearance preferences, local revision history and portable backups.
- Source-preserving Flexcil import with PDF recovery. Existing Flexcil handwriting and synchronized audio have no verified decoder; see [import findings](docs/flexcil-import.md).

## Development

Use Node.js 22 or newer and Bun 1.4.2. Dependencies and workspace packages are recorded in `bun.lock`.

```sh
bun install --frozen-lockfile
bun run dev
```

Run commands from the repository root:

```sh
bun run typecheck
bun run lint:slate
bun run test
bun run build:standalone
bunx playwright install chromium
bun run test:browser
```

The browser suite starts its own production preview on port 3000. Set `SLATE_TEST_URL` to test an already running server; set `SLATE_PRODUCTION_TEST=1` when that server serves a production build. The optional real Flexcil fixture is supplied through `SLATE_FLEXCIL_FIXTURE` and is never committed.

## Build and run

**Independent web:** `bun run build:standalone` writes `dist/standalone`. Serve that folder over HTTPS or a stable localhost origin. After the first load, the cached application shell works offline. `bun run build` retains the optional hosted deployment build.

**Windows and Linux:** build the independent web application, then run `bun run package:desktop`. Application folders appear in `artifacts/desktop`; keep their contents together. Launch `Slate.exe` on Windows or `Slate` on Linux. On Linux with `dpkg-deb`, `bun run package:linux` also creates a versioned Debian package in `artifacts`.

**Android:** use JDK 21 and Android SDK platform 36 / build tools 36.0.0, then run `bun run android:build`. The helper builds and synchronizes the web bundle and verifies the debug APK. Android 7 or newer is required. Signed updates use `bun run android:release --password-file /private/path/slate-signing.password`; preserve the existing signing identity and follow [signing instructions](platform/android/SIGNING.md).

Completed local deliveries belong in `releases/<date-description>/`, separate from build staging in `artifacts`. These generated folders are ignored by Git; distribute packages through GitHub Releases. The current local delivery is `releases/2026-10-03-final-polish`.

## Data and recovery

Notes, preferences, revision history and original imported files stay on the device. Connected vaults write Markdown back to their selected folders. Export portable `.slate.zip` backups from Settings; restore validates hashes and adds copies while preserving existing documents.

Desktop profiles stay under `%APPDATA%/Slate` on Windows and normally `~/.config/Slate` on Linux. Android data belongs to the installation. Browser data belongs to its exact origin and profile. Retain those identities when updating; export a workspace backup before uninstalling or clearing application data.

## Repository

| Path         | Purpose                                                        |
| ------------ | -------------------------------------------------------------- |
| `src/slate/` | Shared application, storage, Markdown, ink and document import |
| `platform/`  | Electron packaging and Android build helpers                   |
| `android/`   | Native Capacitor project                                       |
| `tests/`     | Unit, browser and desktop checks                               |
| `public/`    | Local fonts, icons and document rendering assets               |
| `packages/`  | Local workspace dependencies                                   |
| `docs/`      | Architecture, import research and validation records           |

Read [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) and [the contribution guide](CONTRIBUTING.md) before changing the application. [Repository layout](docs/repository-layout.md) records the history migration and local backup locations.
