---
name: flakemonster
description: Run a test command through FlakeMonster to detect flaky tests by injecting async delays
disable-model-invocation: true
argument-hint: <test command>
---

# FlakeMonster Test Runner

Run the user's test command through FlakeMonster to surface flaky tests.

## Arguments

`$ARGUMENTS` is the full test command to run through FlakeMonster.

**Example invocations:**
- `/flakemonster npx playwright test tests/checkout.spec.ts`
- `/flakemonster npx jest --testPathPattern="api"`
- `/flakemonster node --test test/unit/*.test.js`
- `/flakemonster --runs 20 --mode hardcore npx playwright test`

## Workflow

### 1. Validate FlakeMonster is available

Check if `flake-monster` is available in the project:
- Look for `flake-monster` in `package.json` devDependencies
- Try `npx flake-monster --version`
- If not found, tell the user to install it: `npm install --save-dev flake-monster`

### 2. Check for stale injection state

Before anything else, check if there's an active injection left over from a previous (possibly interrupted) session:

1. Look for `.flake-monster/manifest.json` in the project root
2. If a manifest exists, it means injected delay code is still present in the source files — this **must** be cleaned up before proceeding
3. Run `npx flake-monster restore` to remove the stale injections and delete the manifest
4. Verify the restore succeeded (command exits cleanly)
5. Tell the user: mention that leftover injections from a previous session were detected and cleaned up, and show the seed/mode from the old manifest so they have context

**Why this matters:** If injected code is left in the source from a crashed or interrupted session, running a new injection on top of it will double-inject delays, corrupt the source, and produce meaningless results. Always start from clean source files.



### 3. Determine source file globs

Check for configuration in this order:
1. `.flakemonsterrc.json` or `flakemonster.config.json` in the project root — use `include` patterns from config
2. If no config, scan the project structure and pick sensible defaults:
   - Look for `src/` directory → use `"src/**/*.js"` or `"src/**/*.ts"` (match the file extensions actually present)
   - Look for `lib/` directory → use `"lib/**/*.js"`
   - Look for `app/` directory → use `"app/**/*.js"` or `"app/**/*.ts"`
   - Combine multiple patterns if they exist
3. If still unclear, ask the user which source files to target for delay injection

### 4. Build and run the FlakeMonster command

#### Separate FlakeMonster flags from the test command

If `$ARGUMENTS` contains FlakeMonster flags (`--runs`, `--mode`, `--seed`, `--min-delay`, `--max-delay`, `--exclude`, `--workspace`, `--keep-on-fail`, `--keep-all`), extract them and pass them as direct arguments to `flake-monster test`. Everything else is the test command and goes inside `--cmd "..."`.

Example: if the user says `/flakemonster --runs 20 --mode hardcore npx playwright test`, the command becomes:
```bash
npx flake-monster test --runs 20 --mode hardcore --format json --cmd "npx playwright test" <globs>
```

#### Choose defaults based on config

- If a `.flakemonsterrc.json` or `flakemonster.config.json` exists, **do not** pass `--runs` or `--mode` — let the config file control those defaults. Only pass them if the user explicitly requested specific values.
- If no config file exists and the user didn't specify values, use `--runs 10 --mode medium` as defaults.

#### Handle Playwright commands

If the test command contains `playwright`:
- FlakeMonster has a built-in Playwright JSON parser. When auto-detection sees `playwright` in the command, it automatically selects the `playwright` parser.
- Append `--reporter=json` to the Playwright command inside `--cmd` so that Playwright emits JSON output for the parser (e.g., `--cmd "npx playwright test --reporter=json"`).
- If the user's command already includes a `--reporter` flag, leave it as-is — FlakeMonster will still attempt to parse whatever output format is produced.

#### Execute

```bash
npx flake-monster test --format json [flags] --cmd "<test command>" <globs> 2>&1
```

**Important details:**
- Always use `--format json` so the output is structured and parseable
- The `--cmd` value must be the ENTIRE test command, properly quoted
- If the test command contains single quotes, use double quotes around the `--cmd` value and vice versa
- Capture both stdout and stderr (`2>&1`)
- Use a long timeout (10 minutes) since this runs multiple test iterations

### 5. Analyze results

Parse the JSON output from the run. The structure is:

```json
{
  "version": 1,
  "baseSeed": 12345,
  "runs": [
    {
      "runIndex": 0,
      "seed": 67890,
      "exitCode": 0,
      "durationMs": 5200,
      "parsed": true,
      "totalPassed": 15,
      "totalFailed": 0
    }
  ],
  "analysis": {
    "totalTests": 15,
    "flakyTests": [
      {
        "name": "checkout > should complete payment",
        "file": "tests/checkout.spec.ts",
        "passedRuns": [0, 1, 3, 4],
        "failedRuns": [2, 5],
        "flakyRate": 0.33
      }
    ],
    "stableTests": [...],
    "alwaysFailingTests": [...]
  }
}
```

Report results to the user based on what the data shows:

- **All runs passed** (`analysis.flakyTests` is empty and `analysis.alwaysFailingTests` is empty): Tell the user the test appears stable under delay injection. No timing sensitivity detected.
- **Some tests are flaky** (`analysis.flakyTests` is non-empty): Report each flaky test by name, its failure rate (`flakyRate`), and which seeds caused failures (`failedRuns` indices → look up corresponding `runs[].seed`). Explain that these tests are timing-sensitive — they pass normally but fail when async operations are delayed. Suggest re-running a specific failure with `--seed <seed> --runs 1 --keep-on-fail` for debugging.
- **Tests always fail** (`analysis.alwaysFailingTests` is non-empty): These tests failed on every single run. This is likely a pre-existing bug rather than flakiness — the test is broken regardless of delay patterns. Suggest the user fix these tests first, then re-run to check for flakiness.
- **No tests were parsed** (all runs have `"parsed": false`): Fall back to run-level analysis using `exitCode`. Report how many runs passed (exit code 0) vs failed. Note that per-test breakdown wasn't available — this happens when the test runner's output format isn't recognized.

### 6. Clean up

After reporting results:
- Run `npx flake-monster restore` to ensure no injected code remains in the source files
- Verify with a quick check that source files are clean

## Notes

- FlakeMonster injects `await __FlakeMonster__(N)` delays into async functions in the source code, then runs the test command repeatedly. Each run uses a different random seed, producing different delay patterns. If a test passes normally but fails under certain delay patterns, it's flaky.
- The `--mode` flag controls injection density: `light` (fewer delays), `medium` (default, good balance), `hardcore` (maximum delays).
- Default is 10 runs. For a quick check, 5 runs works. For thorough testing, 20+ runs.
- `--min-delay <ms>` / `--max-delay <ms>` control the delay range (default 0–50ms). Increase `--max-delay` to stress-test slower systems, or decrease it for fast-feedback loops.
- `--exclude <patterns>` skips files from injection. Useful for generated code, vendor files, or known-stable modules. Example: `--exclude "src/generated/**"`.
- `--workspace` creates isolated workspace copies instead of modifying source files in-place. Safer but slower. Combine with `--keep-on-fail` or `--keep-all` to preserve workspaces for inspection.
- `--runner <type>` forces test runner detection (`jest`, `node-test`, `playwright`, `tap`, or `auto`). Use this when auto-detection picks the wrong parser.
- Supported test runner parsers: **Jest** (parsed via `--json` output), **node:test** (NDJSON format), **Playwright** (parsed via `--reporter=json` output), **TAP** (universal fallback).
