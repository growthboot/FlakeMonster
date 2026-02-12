# FlakeMonster

A source-to-source test hardener that finds flaky tests by injecting async delays into your code. It intentionally makes timing worse so race conditions surface *before* they hit production, then gives you a seed to reproduce the exact failure every time.

## Why

Automated tests run unrealistically fast. API calls resolve instantly against local mocks, database queries return in microseconds, commands are fired fasters than you can blink and eye, and every async operation completes in the exact same order every time. In production, none of that is true. Network latency varies, services respond unpredictably, computer performance varies, devices glitch, and users interact at human speed. Tests that pass in this perfectly-timed environment can hide real bugs, race conditions, missing `await`s, and unguarded state mutations, that only surface when timing shifts even slightly.

FlakeMonster closes that gap. It **deliberately injects async delays** between statements in your `async` functions and at the module top level (using top-level `await`), forcing the event loop to yield where it normally wouldn't. Tests that depend on everything happening in a precise order will start failing, and that's the point. A test that only passes because it runs too fast to trigger its own race condition **should not be passing**.

The goal isn't to slow your tests down. The goal is to increasing flake likelyhood random timing glitches so that you can catch the test flakes on your first tests.

Every run uses a **deterministic seed**, so when a test fails you get output like:

```
Run 7/10 FAIL (seed=48291)
```

Re-run with that seed and you'll get the same failure every time. You can inject the delays, leave them there while you fix the issues, then remove them when you're done.

## Install

```bash
npm install flake-monster
```

Requires Node.js >= 18.

## Quick Start

Find flaky tests in 30 seconds:

```bash
# Run your test suite 10 times with injected delays
npx flake-monster test --cmd "npm test"
```

That's it. FlakeMonster will:
1. Inject `await` delays between statements in async functions and at the module top level, directly in your source files
2. Run your tests against the modified code
3. Repeat with a different seed each run
4. Restore your files to their original state
5. Report which runs failed and the seeds to reproduce them

## Use Cases

**Validate AI-generated code**, Coding agents like Claude Code and Codex write tests that pass once and move on. Have the agent run tests through FlakeMonster instead to catch missing `await`s and state races that a normal test run misses because it executes too fast and predictably.

```bash
# After an agent writes async code, verify it isn't flaky
flake-monster test --runs 5 --cmd "npm test"
```

**Browser-based test suites**, Works with Playwright, Cypress, Vitest browser mode, anything that bundles or serves JS. No Node loader hooks, no plugins, no configuration.

```bash
flake-monster test --cmd "npx playwright test" "src/**/*.js"
```

**CI flake gate**, Block merges that introduce flaky tests.

```bash
flake-monster test --runs 10 --cmd "npm test"
```

**Reproduce and debug**, Every failure comes with a seed. Inject delays, debug freely, delays stay pinned while you edit around them.

```bash
flake-monster inject --seed 48291 "src/**/*.js"
# add console.logs, set breakpoints, iterate, delays don't move
flake-monster restore
```

See [Workflows](WORKFLOWS.md) for full details on each.

## Commands

### `flake-monster test`

The main command. Runs your tests multiple times with different delay patterns to surface flakes.

```bash
# Basic, 10 runs, medium density
flake-monster test --cmd "npm test"

# More aggressive, 20 runs, maximum delay injection
flake-monster test --runs 20 --mode hardcore --cmd "npm test"

# Target specific files
flake-monster test --cmd "npm test" "src/api/**/*.js" "src/services/**/*.js"

# Reproduce a specific failure
flake-monster test --runs 1 --seed 48291 --cmd "npm test"

# Use workspace copies instead of modifying source files directly
flake-monster test --workspace --cmd "npm test" --keep-on-fail
```

| Option | Default | Description |
|---|---|---|
| `-r, --runs <n>` | `10` | Number of test runs |
| `-m, --mode <mode>` | `medium` | Injection density: `light`, `medium`, `hardcore` |
| `-s, --seed <seed>` | `auto` | Base seed (`auto` generates one randomly) |
| `-c, --cmd <command>` | `npm test` | Test command to execute |
| `--in-place` | `true` | Modify source files directly (default) |
| `--workspace` | `false` | Use workspace copies instead of modifying source files |
| `--keep-on-fail` | `false` | Keep workspace on failure for inspection (workspace mode only) |
| `--keep-all` | `false` | Keep all workspaces (workspace mode only) |
| `--min-delay <ms>` | `0` | Minimum delay in milliseconds |
| `--max-delay <ms>` | `50` | Maximum delay in milliseconds |

### `flake-monster inject`

Inject delays without running tests. Useful for manual inspection or running tests yourself.

```bash
# Inject in-place (default)
flake-monster inject "src/**/*.js"

# Inject into a workspace copy instead
flake-monster inject --workspace "src/**/*.js"
```

### `flake-monster restore`

Remove all injected delays and restore original source.

```bash
flake-monster restore

# Recovery mode: interactive scan and confirm, use when traces remain after a normal restore
flake-monster restore --recover
```

## Modes

Modes control how many delays get injected:

- **`light`**, One delay at the top of each async function and one at the first module-level statement. Good for a quick sanity check.
- **`medium`**, Delays between statements, skipping before `return`/`throw`. Applies to both async function bodies and top-level module scope. The default, catches most race conditions without being overwhelming.
- **`hardcore`**, Delays between nearly every statement, everywhere. Maximum chaos. Use this when medium isn't surfacing a suspected flake.

## What Gets Injected

FlakeMonster injects delays in two places: **inside async function bodies** and **at the module top level** (using top-level `await`).

### Inside async functions

Given this code:

```js
async function loadUser(id) {
  const user = await api.getUser(id);
  const prefs = await api.getPrefs(id);
  return { ...user, ...prefs };
}
```

FlakeMonster (in `medium` mode) produces something like:

```js
import { __FlakeMonster__ } from "./flake-monster.runtime.js";

async function loadUser(id) {
  /* @flake-monster[jt92-se2j!] v1 */
  await __FlakeMonster__(23);
  const user = await api.getUser(id);
  /* @flake-monster[jt92-se2j!] v1 */
  await __FlakeMonster__(41);
  const prefs = await api.getPrefs(id);
  return { ...user, ...prefs };
}
```

### At the module top level

Top-level `await` is valid in ES modules. FlakeMonster also injects delays between top-level statements to surface races in module initialization order:

```js
import { fetchData } from './api.js';

const config = await fetchData('/config');
const user = await fetchData(`/users/${config.defaultId}`);

export { config, user };
```

Becomes:

```js
import { fetchData } from './api.js';
import { __FlakeMonster__ } from "./flake-monster.runtime.js";

/* @flake-monster[jt92-se2j!] v1 */
await __FlakeMonster__(17);
const config = await fetchData('/config');
/* @flake-monster[jt92-se2j!] v1 */
await __FlakeMonster__(38);
const user = await fetchData(`/users/${config.defaultId}`);
/* @flake-monster[jt92-se2j!] v1 */
await __FlakeMonster__(9);
export { config, user };
```

Each `await __FlakeMonster__(N)` call yields back to the event loop for a short, deterministic duration derived from the seed + location. This is enough to reorder microtask scheduling and expose races.

## Configuration

Create a `.flakemonsterrc.json` or `flakemonster.config.json` in your project root:

```json
{
  "include": ["src/**/*.js"],
  "exclude": ["**/node_modules/**", "**/dist/**", "**/build/**"],
  "mode": "medium",
  "minDelayMs": 0,
  "maxDelayMs": 50,
  "testCommand": "npm test",
  "runs": 10,
  "keepOnFail": true,
  "skipTryCatch": false,
  "skipGenerators": true
}
```

CLI flags override config file values.

## How It Works

1. **Parsing**, Source files are parsed into an AST using [Acorn](https://github.com/acornjs/acorn)
2. **Injection**, `await __FlakeMonster__(N)` statements are inserted at statement boundaries inside async function bodies and at the module top level, with marker comments for tracking
3. **Determinism**, Delay durations are derived from `seed + file + function + position`, so the same seed always produces the same delays
4. **Removal**, Injected code is removed via text-based pattern matching on the unique stamp (`jt92-se2j!`) and the `__FlakeMonster__` identifier, so it works even after linters, formatters, or AI tools have modified the injected code
5. **In-place by default**, Injection happens directly in your source files so you can debug freely. Use `--workspace` for isolated copies if preferred

## Why Source-to-Source (Not Runtime Hooks)

You might wonder why FlakeMonster rewrites files on disk instead of hooking into Node's module loader at runtime. 

Three reasons:

1. **Stable debugging surface**, When a flaky test surfaces, you need to debug it. The injected delays are real code in real files, so you can add `console.log`s, tweak assertions, and iterate freely, the delays stay exactly where they are. A runtime loader would re-inject from scratch on every run, meaning any edit to the file (even adding a log line) shifts injection points and your repro vanishes.

2. **Works in the browser**, Not all test suites run in Node. If you're testing with Playwright, Cypress, Vitest browser mode, or anything that executes in a real browser, a Node loader hook is useless. Source-to-source output is just plain JS files, any bundler, dev server, or browser can run them without special integration.

3. **Language agnostic**, The core engine knows nothing about JavaScript. Adapters handle parsing and injection per language, and the same workspace/seed/reporting machinery works for all of them. A runtime approach would marry the tool to Node's module system permanently.

## Safety

- **Unique identifiers**, Injected code uses `__FlakeMonster__` and a stamp (`jt92-se2j!`) that are unmistakable, making false-positive removal essentially impossible
- **Text-based removal** matches on these unique identifiers, so it works reliably even after linters, formatters, or AI tools rewrite the injected code
- **Deterministic seeds** mean every failure is reproducible
- Automatically excludes `node_modules`, `dist`, and `build` directories
- **Recovery mode**, If traces of injected code remain after a normal restore, `--recover` scans for the stamp and identifier, shows you exactly what it found, and asks for confirmation before removing anything

## Recovery Mode

Normal restore removes injected code automatically using text-based pattern matching. In rare cases, if some traces of injected code remain after a normal restore, recovery mode lets you interactively inspect and confirm what gets removed.

Recovery mode scans for the `jt92-se2j!` stamp, the `__FlakeMonster__` identifier, and the runtime import. It shows you every match before doing anything:

```
$ flake-monster restore --recover
Recovery mode: scanning for injected lines...

  src/api/users.js (4 matches):
    L3  [import] import { __FlakeMonster__ } from "../flake-monster.runtime.js";
    L7  [stamp]  /* @flake-monster[jt92-se2j!] v1 id=a1b2c3d4 seed=921 mode=medium */
    L8  [ident]  await __FlakeMonster__.delay({ seed: 921, file: "src/api/users.js", fn: "getUser", n: 0 });
    L12 [stamp]  /* @flake-monster[jt92-se2j!] v1 id=e5f6g7h8 seed=921 mode=medium */

  Total: 4 line(s) across 1 file(s)

  Remove these lines? (y/N)
```

You see exactly which lines will be removed and why (`stamp`, `ident`, or `import`), then confirm before any files are modified.

## License

MIT
