# Contributing

Develop the application at the repository root. Read `PRODUCT.md`, `DESIGN.md` and `PROJECT.md` first, and retain the existing visual system and offline data contract.

Use Node.js 22+ and Bun 1.4.2. Install with `bun install --frozen-lockfile`, then run `bun run dev`.

Before submitting a change, run:

```sh
bun run typecheck
bun run lint:slate
bun run test
bun run build:standalone
bunx playwright install chromium
bun run test:browser
```

The lint check covers `src/slate`; the inherited template and workspace packages retain separate tooling. GitHub CI checks the application on Windows and Linux. Native shell or input changes also need the relevant desktop or Android verification described in `docs/platforms.md`.

Use synthetic fixtures and isolated profiles for tests. Preserve user notes, original imports, vault identities and Android signing identity. Record device limitations honestly in the relevant validation document.

Commit source, tests and documentation. Keep generated builds in `artifacts`, completed deliveries in `releases`, and local archives or research in `.local`. Publish distributable binaries through GitHub Releases.
