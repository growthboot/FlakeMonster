# FlakeMonster — Version History

> **IMPORTANT — never overwrite a released version entry.**
> Each `npm publish` gets its own permanent entry in this file.
> Do NOT edit or replace a previous version's section — always add a new one.
> Add changes to the **Unreleased** section as you work, then move them
> into a new version heading at release time.

## How to Log Changes

Add entries to the **Unreleased** section as you work. Use these prefixes:

- **Added** — new features or capabilities
- **Fixed** — bug fixes
- **Changed** — modifications to existing behavior
- **Removed** — removed features or deprecated code
- **Internal** — refactors, test changes, dev tooling (not user-facing)

When a release is cut, move the Unreleased entries into a new version heading and reset the section. See `VERSION-BUMP.md` for the full release process.

---

## Unreleased (0.4.6)

- **Fixed** — Test command no longer loses track of files between runs; between-run restoration now uses glob-based `restoreByGlobs` instead of manifest-based `restoreAll`, preventing the cascade bug where a file dropped from the manifest could never be restored by subsequent runs (reported by FSCode team)
- **Fixed** — Error handler in test command now actually attempts source file restoration on crash instead of just printing a message
- **Internal** — Added GitHub Action integration example to README
- **Internal** — Added changelog link to README

---

## Released Versions

### 0.4.5 — 2026-02-22
- **Fixed** — Test command `results` array was never populated (`results.push(result)` missing from both in-place and workspace code paths), causing JSON output to always report zero runs and zero tests — broke CI/GitHub Action integration

### 0.4.4 — 2026-02-22
- **Added** — TAP parser now handles nested subtests (node:test describe/it), producing compound names like `Cache > warm-up populates all keys` and extracting file paths and durations from YAML diagnostic blocks

### 0.4.3 — 2026-02-22
- **Fixed** — Auto-add `--test-reporter tap` when `node --test` runner is detected (default spec reporter outputs to stderr, not stdout) and route through TAP parser for reliable test result parsing

### 0.4.1 — 2026-02-20
_Retroactively logged from git history._
- **Added** — Sticky status line (`StickyLine`) replaces `Spinner`; persists at terminal bottom while test output scrolls above
- **Added** — Real-time test output streaming via `onStdout`/`onStderr` callbacks in `execAsync`
- **Added** — Manifest guards on `inject` and `test` commands; detects stale/active injections and prompts to restore before proceeding
- **Fixed** — Runtime import path computation now uses `posix.normalize` + `dirname` instead of naive split counting
- **Changed** — CLI `--version` reads from `package.json` at runtime instead of a hardcoded string
- **Internal** — Made `bin/flake-monster.js` executable (`chmod +x`)

### 0.4.0 — 2026-02-19
_Retroactively logged from git history._
- **Added** — Terminal module (`src/cli/terminal.js`) with color detection, ANSI wrappers, progress bars, box drawing, and `Spinner` class
- **Added** — Reporter overhaul: colored run results, injection stats, progress tallies, restoration summary, and rich final summary with box drawing
- **Changed** — Test command now runs test processes asynchronously (`execAsync`) instead of synchronous `execSync`
- **Internal** — Added `reporter.test.js` and `terminal.test.js`

### 0.3.5 — 2026-02-15
_Retroactively logged from git history._
- **Fixed** — Manifest-free recovery now always uses broad globs (`**/*.js`, `**/*.mjs`) instead of `config.include`, which may be too narrow (e.g. `src/**`) to find all leftover injections
- **Internal** — Added tests for broad-glob recovery of files outside `src/`

### 0.3.4 — 2026-02-15
_Retroactively logged from git history._
- **Added** — Manifest-free scan and restore via glob patterns (`scanByGlobs`, `restoreByGlobs` on `InjectorEngine`)
- **Added** — `restore` command auto-detects leftover injected code when no manifest exists and prompts for interactive recovery
- **Fixed** — Typos in README ("fasters" → "faster", "increasing flake likelyhood" → "increase the likelihood")
- **Internal** — Added `engine-recovery.test.js` with scan, restore, exclude, and end-to-end tests

### 0.3.3 — 2026-02-14
_Retroactively logged from git history._
- **Fixed** — Runtime import is now inserted before leading block comments (JSDoc) instead of landing inside them when no existing imports are present
- **Internal** — Added `leading-jsdoc.js` fixture and corresponding test

### 0.3.2 — 2026-02-14
_Retroactively logged from git history._
- **Fixed** — Patched astravel `PropertyDefinition` traversal crash on uninitialized class fields (`value: null`)
- **Added** — Idempotent injection: adapter skips files that already contain the `@flake-monster` marker stamp
- **Internal** — Added `class-fields.js` fixture and tests for class fields and idempotency

### 0.3.1 — 2026-02-14
_Retroactively logged from git history._
- **Fixed** — Adapter `inject()` now catches parse errors and skips unparseable files instead of crashing the entire run
- **Fixed** — CLI `--version` updated from stale `0.1.0` to `0.3.1`
- **Internal** — Added publish checklist to `VERSION-BUMP.md`

### 0.3.0 — 2026-02-14
_Retroactively logged from git history._
- **Added** — Hero install widget on the website with tabbed npx/npm/CDN/download commands and copy-to-clipboard
- **Added** — `--exclude` CLI flag for inject and test commands
- **Added** — Pricing page (`pricing.html`)
- **Internal** — Added `VERSION-BUMP.md` checklist

### 0.2.0 — 2026-02-13
_Retroactively logged from git history._
- **Added** — Demo website with interactive code visualizations, syntax highlighting, and logo (`index.html`, `website/`)
- **Added** — Test output parsers for Jest, node:test, and TAP formats (`src/core/parsers/`)
- **Added** — Flake analyzer module (`src/core/flake-analyzer.js`)
- **Added** — Local dev server tooling (`Caddyfile`, `serve.sh`)
- **Added** — MIT License
- **Changed** — Default to in-place injection mode (no workspace copy by default)
- **Changed** — Delays are now computed at injection time and embedded directly in code; runtime simplified to a one-liner
- **Changed** — Remover rewritten to use text-based line matching instead of AST-based removal
- **Internal** — Added `top-level-await.js` fixture; expanded injector and remover tests; added parser and flake-analyzer tests

### 0.1.0 — 2026-02-13
_Retroactively logged from git history._
Initial publish. CLI entry point, core engine (workspace, manifest, profile, seed, config, reporter), JavaScript adapter (parser, injector, remover, codegen), runtime, CLI commands (inject, restore, test), tests and fixtures.
