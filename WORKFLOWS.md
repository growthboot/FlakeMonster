# Workflows

Real-world workflows for integrating Flake Monster into your development process — from browser-based test suites to automated coding agents.

## Browser-Based Test Suites

Flake Monster's source-to-source approach means the injected output is just plain JavaScript files. No Node loader hooks, no special runtime flags — any tool that can bundle or serve JS files can run them. This makes it work out of the box with browser-based test runners.

### Playwright

```bash
# Run Playwright tests against injected code
flake-monster test --cmd "npx playwright test" "src/**/*.js"
```

Playwright runs tests in real browser contexts. Because Flake Monster modifies the source files themselves, the delays survive bundling and execute in the browser just like any other `await`. The workspace symlinks your `node_modules`, so Playwright's config and browser binaries resolve normally.

For projects where Playwright needs specific config files:

```bash
# Keep a failing workspace and run Playwright against it manually
flake-monster inject --seed 48291 "src/**/*.js"

# Point Playwright at the workspace
npx playwright test --config .flake-monster/workspaces/inject-seed-48291/playwright.config.js
```

### Cypress

```bash
flake-monster test --cmd "npx cypress run" "src/**/*.js"
```

For Cypress component tests, the workspace contains your full source tree with delays injected. Cypress's bundler (webpack or Vite) processes the injected files the same as originals.

### Vitest Browser Mode

```bash
flake-monster test --cmd "npx vitest run --browser" "src/**/*.js"
```

Vitest browser mode uses Vite to serve test files to a real browser. The injected `await Flake.delay(...)` calls are standard ESM — Vite handles them transparently.

### Why This Works

The `flake-monster.runtime.js` file is self-contained with zero Node dependencies. It uses only `setTimeout` and `Promise` — APIs available in every browser. When your bundler processes the injected import:

```js
import { Flake } from "../flake-monster.runtime.js";
```

It resolves and bundles it like any other module. No polyfills, no Node shims, no configuration.

---

## Coding Agent Workflows

AI coding agents (Claude Code, OpenAI Codex, Cursor, etc.) write code and tests fast — but they have a blind spot: **timing assumptions**. An agent writes a test that passes on the first run and moves on. But the test might only pass because every async operation completes instantly in the test environment. The moment timing shifts in CI — different machine, different load, parallel test execution — the test starts flaking.

Flake Monster catches these before the agent's output gets merged.

### Claude Code

Run Flake Monster as a validation step after Claude Code writes or modifies async code:

```bash
# After Claude Code writes new tests
flake-monster test --runs 5 --cmd "npm test" "src/**/*.js"
```

Or integrate it into your CLAUDE.md instructions:

```markdown
## Testing Policy

After writing or modifying async code, run:
  flake-monster test --runs 5 --cmd "npm test"

If any run fails, fix the race condition before moving on.
The failing seed will reproduce the exact timing that caused the failure.
```

This creates a feedback loop: the agent writes code, Flake Monster surfaces timing bugs, the agent fixes them — all in one session.

### OpenAI Codex

Codex runs in a sandboxed environment and executes tests as part of its workflow. Add Flake Monster to the verification step:

```bash
# In your Codex task instructions
npm test && flake-monster test --runs 5 --mode light --cmd "npm test"
```

Using `--mode light` keeps overhead low (one delay per async function) while still catching the most common race conditions — missing `await`s and unguarded state mutations.

### General Agent Integration Pattern

The pattern works with any agent that can run shell commands:

1. **Agent writes code** — new feature, bug fix, refactor
2. **Agent runs normal tests** — confirms the basic logic works
3. **Agent runs Flake Monster** — confirms the async timing is sound
4. **If flakes found** — agent gets the failing seed and can debug deterministically

```bash
# Step 2: Normal test pass
npm test

# Step 3: Flake validation
flake-monster test --runs 5 --cmd "npm test"

# Step 4: If step 3 failed, reproduce and fix
flake-monster test --runs 1 --seed <failing-seed> --cmd "npm test" --keep-on-fail
# Inspect .flake-monster/workspaces/run-0-seed-<seed>/ to see where delays were injected
```

The key insight: **agents don't experience flaky tests** because they run tests once and move on. Flake Monster forces multiple runs with varied timing, simulating the conditions where flakes actually surface.

### CI Gate for Agent-Generated PRs

If agents open PRs autonomously, add Flake Monster as a CI check:

```yaml
# .github/workflows/flake-check.yml
name: Flake Check
on: [pull_request]

jobs:
  flake-monster:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx flake-monster test --runs 10 --cmd "npm test"
```

This catches flaky tests from both humans and agents before they hit the main branch.

---

## Debugging a Flaky Test

When Flake Monster finds a failure, here's the workflow to track it down.

### 1. Reproduce It

```bash
# Use the exact seed from the failure
flake-monster test --runs 1 --seed 48291 --cmd "npm test" --keep-on-fail
```

This recreates the same delay pattern that caused the failure. The `--keep-on-fail` flag preserves the workspace.

### 2. Inspect the Injected Code

```bash
# Look at what was injected
cat .flake-monster/workspaces/run-0-seed-48291/src/api/client.js
```

You'll see `await Flake.delay(...)` calls between your statements. The delay that caused the failure is somewhere in there — it forced a yield at a point where your code assumed synchronous execution.

### 3. Switch to In-Place Mode

For iterative debugging, workspace mode gets tedious. Switch to in-place injection so you can edit freely:

```bash
# Inject with the same seed directly into your source
flake-monster inject --in-place --seed 48291 "src/**/*.js"

# Now iterate: add console.logs, set breakpoints, run tests repeatedly
npm test

# The delays are pinned — your edits won't move them
# When you've found and fixed the bug:
flake-monster restore --in-place
```

This is where the source-to-source approach pays off. The delays are real code in your files. You can add debugging statements, change assertions, comment out lines — and the delays stay exactly where they are. A runtime approach would re-inject on every run, so even adding a `console.log` could shift the delay positions and lose your repro.

### 4. Verify the Fix

```bash
# Run with the same seed to confirm the fix
flake-monster test --runs 1 --seed 48291 --cmd "npm test"

# Then run a broader check to make sure you didn't introduce new flakes
flake-monster test --runs 10 --cmd "npm test"
```

---

## CI / CD Integration

### PR Check (Fast)

```yaml
- run: npx flake-monster test --runs 5 --mode light --cmd "npm test"
```

Light mode with 5 runs adds minimal overhead while catching obvious race conditions.

### Nightly Build (Thorough)

```yaml
- run: npx flake-monster test --runs 30 --mode hardcore --cmd "npm test"
```

Hardcore mode with 30 runs is slow but comprehensive. Run it nightly to surface subtle timing issues.

### Targeted Checks on Changed Files

```bash
# Only inject delays into files changed in this PR
CHANGED=$(git diff --name-only origin/main -- '*.js' | tr '\n' ' ')
flake-monster test --runs 10 --cmd "npm test" $CHANGED
```

This focuses the chaos on the code that actually changed, keeping CI fast.

---

## Stress Testing Specific Modules

When you suspect a particular module has timing issues but normal runs aren't surfacing them:

```bash
# Maximum chaos on a specific module
flake-monster test \
  --runs 50 \
  --mode hardcore \
  --min-delay 10 \
  --max-delay 200 \
  --cmd "npm test -- --grep 'checkout'" \
  "src/checkout/**/*.js"
```

The combination of:
- **50 runs** — more seeds, more timing variations
- **`hardcore` mode** — delays between every statement
- **Higher delays** (10–200ms) — amplifies timing differences
- **Targeted glob** — only injects into the suspected module
- **Filtered test command** — only runs relevant tests

...maximizes the chance of catching an intermittent race in that module without wasting time on unrelated code.

---

## Configuration File

For repeatable setups, use a config file instead of CLI flags:

```json
// .flakemonsterrc.json
{
  "include": ["src/**/*.js"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  "mode": "medium",
  "minDelayMs": 0,
  "maxDelayMs": 50,
  "testCommand": "npm test",
  "runs": 10,
  "keepOnFail": true
}
```

CLI flags override config values, so you can set sensible defaults in the file and tweak per-run:

```bash
# Uses config defaults but overrides mode and runs
flake-monster test --mode hardcore --runs 30
```
