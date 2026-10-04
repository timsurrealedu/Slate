# Graph Report - Slate  (2026-10-04)

## Corpus Check
- 169 files · ~90,681 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1120 nodes · 2074 edges · 159 communities (55 shown, 104 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.78)
- Token cost: unavailable. Session agents performed semantic extraction; their actual token counters are not exposed.

## Graph Freshness
- Built from commit: `bb76b897`
- This identifies the source snapshot; a subsequent commit containing only graph outputs does not change the indexed source.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Workspace Navigation and Library
- Markdown Editing and Rendering
- Persistence and Vault Storage
- Browser Workflow Helpers
- Desktop Packaging and Scripts
- Flexcil Container Import
- Product Design and Governance
- Hosted Application Routing
- Android Vault and Export
- TypeScript Compiler Settings
- Electron Lifecycle and Vaults
- Workspace Preferences and Saves
- Runtime Dependency Manifest
- Ink Gestures and Geometry
- Component Library Configuration
- Shared Material Icons
- Notebook Tools and Pages
- Platform Delivery Evidence
- Paper and Stroke Rendering
- Flexcil Research and Preservation
- Application Lifecycle and Navigation
- Android Insets and Back
- Android Build and Signing
- Settings and Document Exports
- Vault Organization and Rename
- Development Dependency Manifest
- Local Data Architecture
- Document and Page Creation
- Static Downloads and Viewports
- Vault Refresh and Visibility
- Hosted Media Generation Helpers
- Standalone Build and Offline
- Android Instrumented Test Scaffold
- Hosted Server Binding Examples
- Hosted Error Reporting
- Independent Web Entry
- Android Unit Test Scaffold
- Android Gradle Wrapper
- Responsive React Hook
- Local Search Worker
- Browser Capture Tools
- Static Test Server
- @base-ui/react Dependency
- @capacitor/browser Dependency
- @capacitor/cli Dependency
- Capacitor Application Configuration
- @capacitor/core Dependency
- @capacitor/filesystem Dependency
- class-variance-authority Dependency
- @cloudflare/workers-types Dependency
- clsx Dependency
- cmdk Dependency
- @codemirror/autocomplete Dependency
- @codemirror/lang-markdown Dependency
- @codemirror/language Dependency
- @codemirror/search Dependency
- @codemirror/state Dependency
- date-fns Dependency
- electron Dependency
- @electron/packager Dependency
- embla-carousel-react Dependency
- eslint Dependency
- eslint-config-prettier Dependency
- @eslint/js Dependency
- eslint-plugin-prettier Dependency
- eslint-plugin-react-hooks Dependency
- eslint-plugin-react-refresh Dependency
- fake-indexeddb Dependency
- fflate Dependency
- @fontsource/source-serif-4 Dependency
- @fontsource-variable/dm-sans Dependency
- @higgsfield/fnf Dependency
- @higgsfield/fnf-react Dependency
- @higgsfield/quanta Dependency
- @hookform/resolvers Dependency
- input-otp Dependency
- js-yaml Dependency
- katex Dependency
- @lezer/highlight Dependency
- lucide-react Dependency
- @material-symbols/svg-400 Dependency
- mathlive Dependency
- nitro Dependency
- pdf-lib Dependency
- pdfjs-dist Dependency
- perfect-freehand Dependency
- @radix-ui/react-accordion Dependency
- @radix-ui/react-alert-dialog Dependency
- @radix-ui/react-aspect-ratio Dependency
- @radix-ui/react-avatar Dependency
- @radix-ui/react-checkbox Dependency
- @radix-ui/react-collapsible Dependency
- @radix-ui/react-context-menu Dependency
- @radix-ui/react-dialog Dependency
- @radix-ui/react-dropdown-menu Dependency
- @radix-ui/react-hover-card Dependency
- @radix-ui/react-label Dependency
- @radix-ui/react-menubar Dependency
- @radix-ui/react-navigation-menu Dependency
- @radix-ui/react-popover Dependency
- @radix-ui/react-progress Dependency
- @radix-ui/react-radio-group Dependency
- @radix-ui/react-scroll-area Dependency
- @radix-ui/react-select Dependency
- @radix-ui/react-slider Dependency
- @radix-ui/react-slot Dependency
- @radix-ui/react-switch Dependency
- @radix-ui/react-tabs Dependency
- @radix-ui/react-toggle-group Dependency
- react-day-picker Dependency
- react-hook-form Dependency
- react-resizable-panels Dependency
- @replit/codemirror-vim Dependency
- sonner Dependency
- @stylexjs/stylex Dependency
- tailwind-merge Dependency
- tailwindcss Dependency
- @tailwindcss/vite Dependency
- @tanstack/react-query Dependency
- @tanstack/react-router Dependency
- @tanstack/react-start Dependency
- @tanstack/router-plugin Dependency
- tw-animate-css Dependency
- vaul Dependency
- vite-tsconfig-paths Dependency
- zod Dependency
- @playwright/test Dependency
- prettier Dependency
- @types/katex Dependency
- @types/node Dependency
- @types/react Dependency
- @types/react-dom Dependency
- typescript Dependency
- typescript-eslint Dependency
- vite Dependency
- vite-plugin-svgr Dependency
- @vitejs/plugin-react Dependency
- vitest Dependency
- Cloudflare Worker Types
- Document Adapter Types
- SVG Import Types

## God Nodes (most connected - your core abstractions)
1. `SlateDocument` - 29 edges
2. `Page` - 22 edges
3. `SlateVaultPlugin` - 21 edges
4. `scripts` - 21 edges
5. `Library()` - 21 edges
6. `ready()` - 21 edges
7. `Folder` - 20 edges
8. `latest()` - 20 edges
9. `openDatabase()` - 18 edges
10. `compilerOptions` - 18 edges

## Surprising Connections
- `Connected-vault identity and data integrity` --semantically_similar_to--> `Validated portable Slate backups`  [INFERRED] [semantically similar]
  PROJECT.md → README.md
- `writePreferences()` --indirect_call--> `prefs()`  [INFERRED]
  src/slate/core/workspace.ts → tests/browser/tablet-notebook.spec.ts
- `Library and tag refinement review` --conceptually_related_to--> `Slate visual system`  [INFERRED]
  .impeccable/review/library-and-tags-2026-10-02.md → DESIGN.md
- `Incremental workspace refinement review` --conceptually_related_to--> `Slate visual system`  [INFERRED]
  .impeccable/review/refinements-2026-10-01.md → DESIGN.md
- `Windows icon provenance` --conceptually_related_to--> `Slate visual system`  [INFERRED]
  platform/desktop/ICON-SOURCE.md → DESIGN.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **One local study core across independent platform shells** — docs_architecture_local_first_core, docs_platforms_independent_web, docs_platforms_electron_shell, docs_platforms_capacitor_android [EXTRACTED 1.00]
- **Retain user data before replacing, restoring or hiding records** — docs_architecture_revision_checked_persistence, docs_architecture_additive_portable_backups, docs_flexcil_import_original_source_preservation, docs_library_fixes_2026_10_02_markdown_source_fidelity, docs_library_and_tags_2026_10_02_safe_physical_rename, docs_vault_refresh_2026_10_02_vaultmissing_reconciliation [INFERRED 0.85]
- **Preserve locally owned work across import, restore and update** — product_local_ownership, project_connected_vault_integrity, project_opfs_import_materialization, readme_workspace_identity, readme_portable_backup, platform_android_signing_update_identity [INFERRED 0.85]
- **One independent application underpins web and native distribution** — product_shared_offline_application, readme_independent_web_build, standalone_application_shell, _github_workflows_ci_validation_pipeline, platform_android_signing_release_build_pipeline [INFERRED 0.95]

## Communities (159 total, 104 thin omitted)

### Community 0 - "Workspace Navigation and Library"
Cohesion: 0.05
Nodes (46): folderChildren(), folderName(), folderTrail(), hiddenPath(), itemName(), parentFolder(), pathParts(), visibleWorkspace() (+38 more)

### Community 1 - "Markdown Editing and Rendering"
Cohesion: 0.06
Nodes (48): dompurify, marked, dompurify, marked, headings(), workspace, disposeTitleEditor(), FileTitle() (+40 more)

### Community 2 - "Persistence and Vault Storage"
Cohesion: 0.06
Nodes (41): DEFAULT_PREFERENCES, cacheVaultDocument(), checkpointDocument(), clearDatabaseForTests(), commitImport(), docSchema, done(), exportWorkspace() (+33 more)

### Community 3 - "Browser Workflow Helpers"
Cohesion: 0.08
Nodes (27): Page, PreviewWidget, openNote(), key(), openEquation(), anchor(), notebook(), documents() (+19 more)

### Community 4 - "Desktop Packaging and Scripts"
Cohesion: 0.04
Nodes (45): name, overrides, @types/react, private, scripts, android:build, android:release, android:sync (+37 more)

### Community 5 - "Flexcil Container Import"
Cohesion: 0.10
Nodes (31): DEFAULT_PAPER, check(), FLEXCIL_LIMITATIONS, importFlexcil(), ImportOptions, limits, objects(), source() (+23 more)

### Community 6 - "Product Design and Governance"
Cohesion: 0.08
Nodes (30): Windows and Linux CI, Cross-platform production validation pipeline, Library and tag refinement review, Incremental workspace refinement review, Scoped visual release review, Maintained root application direction, Contribution and validation contract, Adaptive context and reading layout (+22 more)

### Community 7 - "Hosted Application Routing"
Cohesion: 0.08
Nodes (30): consumeLastCapturedError(), record(), renderErrorPage(), getRouter(), Route, src/routes/__root.tsx application layout, File-based routing contract, TanStack Start file-based routing (+22 more)

### Community 8 - "Android Vault and Export"
Cohesion: 0.14
Nodes (17): ActivityCallback, ActivityResult, CapacitorPlugin, PluginCall, PluginMethod, SlateExportPlugin, Child, ActivityCallback (+9 more)

### Community 9 - "TypeScript Compiler Settings"
Cohesion: 0.07
Nodes (29): DOM, DOM.Iterable, ES2022, eslint.config.js, ./src/lib/quanta-material-icons.ts, src/**/*.ts, src/**/*.tsx, vite/client (+21 more)

### Community 10 - "Electron Lifecycle and Vaults"
Cohesion: 0.09
Nodes (14): trustedDependencies, { app, BrowserWindow, Menu, shell, dialog, ipcMain }, { createVaultStore }, fs, http, mime, path, { contextBridge, ipcRenderer } (+6 more)

### Community 11 - "Workspace Preferences and Saves"
Cohesion: 0.12
Nodes (18): Preferences, commitOrganization(), countSaves(), dirty, listeners, organization, organize(), publish() (+10 more)

### Community 12 - "Runtime Dependency Manifest"
Cohesion: 0.10
Nodes (21): @capacitor/android, @capacitor/app, @codemirror/commands, @codemirror/view, mammoth, dependencies, @capacitor/android, @capacitor/app (+13 more)

### Community 13 - "Ink Gestures and Geometry"
Cohesion: 0.18
Nodes (13): Point, Stroke, bounds(), contains(), distanceToSegment(), hitStroke(), intersects(), Rect (+5 more)

### Community 14 - "Component Library Configuration"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 15 - "Shared Material Icons"
Cohesion: 0.11
Nodes (17): IconCheckmark2MediumOutlined, IconChevronBottomOutlined, IconChevronDownMediumOutlined, IconChevronGrabberVerticalOutlined, IconChevronLeftMediumOutlined, IconChevronRightMediumOutlined, IconCircleCheckOutlined, IconCircleInfoOutlined (+9 more)

### Community 16 - "Notebook Tools and Pages"
Cohesion: 0.20
Nodes (12): duplicatePage(), useWorkspace(), InkHandle, InkTool, darkInk, inkColorForPaper(), inkNames, InkToolbar() (+4 more)

### Community 17 - "Platform Delivery Evidence"
Cohesion: 0.20
Nodes (8): MathLive equation keyboard ownership, Focal-point notebook pinch rendering, MathLive virtual keyboard guide, Android predictive Back navigation, Capacitor Android shell, Electron desktop shell, Android native Save export, Current delivery versus historical evidence

### Community 18 - "Paper and Stroke Rendering"
Cohesion: 0.21
Nodes (14): Paper, PAPER_COLORS, PAPER_STYLES, PaperStyle, Theme, directPath(), drawPaper(), drawStroke() (+6 more)

### Community 19 - "Flexcil Research and Preservation"
Cohesion: 0.20
Nodes (12): Flexcil audio recording and syncing documentation, Controlled Flexcil decoder fixtures, Historical Flexcil nested ZIP findings, Bounded seekable Flexcil importer, Scoped fingerprint duplicate prevention, Immutable original Flexcil assets, Unverified Flexcil object and audio decoding, Shared drag lifecycle cleanup (+4 more)

### Community 20 - "Application Lifecycle and Navigation"
Cohesion: 0.25
Nodes (11): DocumentKind, useVisibleWorkspace(), FlexcilReport, bindNative(), isLocalApplication(), isNative(), NativeBackEvent, reducedMotion() (+3 more)

### Community 21 - "Android Insets and Back"
Cohesion: 0.27
Nodes (6): MainActivity, BridgeActivity, Bundle, Configuration, Insets, Override

### Community 22 - "Android Build and Signing"
Cohesion: 0.20
Nodes (10): app, buildApk(), run(), argument, decipher, directory, envelope, key (+2 more)

### Community 23 - "Settings and Document Exports"
Cohesion: 0.23
Nodes (7): exportDocument(), downloadBlob(), exportFilename(), nativeExport, PaperPicker(), Props, Settings()

### Community 24 - "Vault Organization and Rename"
Cohesion: 0.24
Nodes (7): Recoverable folder Trash, Safe physical file and folder moves, Verified physical vault Rename, Bounded high-zoom notebook rendering, Unified editable Markdown heading, Connected folder vault adapters, Universal line-number, Vim and layout preferences

### Community 25 - "Development Dependency Manifest"
Cohesion: 0.22
Nodes (9): @axe-core/playwright, globals, devDependencies, @axe-core/playwright, globals, @types/dompurify, @types/js-yaml, @types/dompurify (+1 more)

### Community 26 - "Local Data Architecture"
Cohesion: 0.39
Nodes (7): Validated additive portable backups, Authoritative Markdown contract, Local-first shared study core, Offline shell and save-aware upgrades, Revision-checked IndexedDB persistence, Direct pressure-aware ink segments, Pen, palm and two-finger arbitration

### Community 27 - "Document and Page Creation"
Cohesion: 0.53
Nodes (7): makeDocument(), newId(), newPage(), exampleInk(), seedWorkspace(), importFile(), loadPdf()

### Community 28 - "Static Downloads and Viewports"
Cohesion: 0.25
Nodes (4): MainActivity immersive inset ownership, Verified anonymous archive downloads, Shared safe-area CSS contract, Independent static web application

### Community 29 - "Vault Refresh and Visibility"
Cohesion: 0.25
Nodes (5): Android asset and signing verification, Shared hidden-path visibility filter, Restored document session, Sanitized Obsidian-compatible Markdown rendering, vaultMissing reconciliation and startup refresh

### Community 30 - "Hosted Media Generation Helpers"
Cohesion: 0.33
Nodes (3): GenerationMediaPreview, getGenerationFailureLabel(), getGenerationStatusLabel()

### Community 32 - "Android Instrumented Test Scaffold"
Cohesion: 0.60
Nodes (3): ExampleInstrumentedTest, Test, RunWith

### Community 33 - "Hosted Server Binding Examples"
Cohesion: 0.50
Nodes (3): getGreeting, AppEnv, bindings()

### Community 34 - "Hosted Error Reporting"
Cohesion: 0.40
Nodes (3): HiggsfieldErrorOptions, HiggsfieldEvents, Window

### Community 35 - "Independent Web Entry"
Cohesion: 0.60
Nodes (3): Independent web HTML shell, Independent web content security policy, src/standalone-entry.tsx entry point

### Community 37 - "Android Gradle Wrapper"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 38 - "Responsive React Hook"
Cohesion: 0.50
Nodes (3): react, react, useIsMobile()

## Knowledge Gaps
- **294 isolated node(s):** `config`, `$schema`, `style`, `rsc`, `tsx` (+289 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **104 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderMarkdown()` connect `Markdown Editing and Rendering` to `Workspace Navigation and Library`?**
  _High betweenness centrality (0.183) - this node is a cross-community bridge._
- **Why does `dompurify` connect `Markdown Editing and Rendering` to `Runtime Dependency Manifest`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **What connects `config`, `$schema`, `style` to the rest of the system?**
  _294 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Workspace Navigation and Library` be split into smaller, more focused modules?**
  _Cohesion score 0.05467856325783574 - nodes in this community are weakly interconnected._
- **Should `Markdown Editing and Rendering` be split into smaller, more focused modules?**
  _Cohesion score 0.056842105263157895 - nodes in this community are weakly interconnected._
- **Should `Persistence and Vault Storage` be split into smaller, more focused modules?**
  _Cohesion score 0.06041986687147977 - nodes in this community are weakly interconnected._
## Refresh scope and integrity

Scope: Slate application, native platforms, tests and docs. Inherited template packages and bundled third-party assets are excluded by `.graphifyignore`. All source paths and manifest keys are relative to the repository.

The 8 declarative JSON files have file nodes without AST symbols. Explicit source references contribute 38 auditable document links.

Graph health warning: 293 dangling endpoint edges; 23 directed same endpoint collapsed edges; 24 undirected same endpoint collapsed edges. The default undirected graph collapses repeated endpoint pairs. See [GRAPH_HEALTH.md](GRAPH_HEALTH.md) for examples; use care when interpreting individual relationships.
