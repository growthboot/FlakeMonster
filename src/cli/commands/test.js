import { resolve } from 'node:path';
import { AdapterRegistry } from '../../adapters/registry.js';
import { createJavaScriptAdapter } from '../../adapters/javascript/index.js';
import { InjectorEngine } from '../../core/engine.js';
import { FlakeProfile } from '../../core/profile.js';
import { parseSeed, deriveSeed } from '../../core/seed.js';
import { ProjectWorkspace, getFlakeMonsterDir, execAsync } from '../../core/workspace.js';
import { loadConfig, mergeWithCliOptions } from '../../core/config.js';
import { Reporter } from '../../core/reporter.js';
import { detectRunner, parseTestOutput } from '../../core/parsers/index.js';
import { analyzeFlakiness } from '../../core/flake-analyzer.js';
import * as terminal from '../terminal.js';
import { Spinner } from '../terminal.js';

export function registerTestCommand(program) {
  program
    .command('test')
    .description('Run tests multiple times with injected delays to find flakes')
    .option('-r, --runs <n>', 'Number of test runs', '10')
    .option('-m, --mode <mode>', 'Injection density: light, medium, hardcore', 'medium')
    .option('-s, --seed <seed>', 'Base seed (or "auto")', 'auto')
    .option('-c, --cmd <command>', 'Test command to execute', 'npm test')
    .option('--in-place', 'Modify source files directly (default)', true)
    .option('--workspace', 'Use workspace copies instead of modifying source files directly', false)
    .option('--keep-on-fail', 'Keep workspace on test failure for inspection', false)
    .option('--keep-all', 'Keep all workspaces (pass or fail)', false)
    .option('--min-delay <ms>', 'Minimum delay in milliseconds', '0')
    .option('--max-delay <ms>', 'Maximum delay in milliseconds', '50')
    .option('-f, --format <format>', 'Output format: text or json', 'text')
    .option('--runner <runner>', 'Test runner: jest, node-test, tap, or auto', 'auto')
    .option('-e, --exclude <patterns...>', 'Glob patterns to exclude (appends to config defaults)')
    .argument('[globs...]', 'File patterns to process', ['src/**/*.js'])
    .action(async (globs, options) => {
      try {
        const projectRoot = resolve('.');
        const config = await loadConfig(projectRoot);
        const merged = mergeWithCliOptions(config, options);

        const baseSeed = parseSeed(options.seed);
        const runs = Number(options.runs);
        const testCmd = options.cmd;
        const inPlace = !options.workspace;
        const jsonOutput = options.format === 'json';

        // Resolve which runner parser to use
        const runner = options.runner === 'auto'
          ? detectRunner(testCmd)
          : options.runner;

        const profile = FlakeProfile.fromConfig(merged);
        const registry = new AdapterRegistry();
        registry.register(createJavaScriptAdapter());
        const engine = new InjectorEngine(registry, profile);
        const reporter = new Reporter({ quiet: jsonOutput, terminal });

        reporter.log(`FlakeMonster test harness`);
        reporter.log(`  Runs: ${runs} | Mode: ${profile.mode} | Base seed: ${baseSeed}`);
        reporter.log(`  Command: ${testCmd}`);
        reporter.log(`  Patterns: ${globs.join(', ')}`);
        if (runner) {
          reporter.log(`  Runner: ${runner}`);
        }
        if (inPlace) {
          reporter.log('  Mode: in-place (source files will be modified and restored)');
        }
        reporter.log('');

        const harnessTotalStart = Date.now();
        const results = [];
        let lastManifest = null;

        for (let i = 0; i < runs; i++) {
          const runSeed = deriveSeed(baseSeed, `run:${i}`);

          if (inPlace) {
            // Restore previous run's injections before re-injecting
            if (lastManifest) {
              await engine.restoreAll(projectRoot, lastManifest);
            }

            // Inject directly into source
            const manifest = await engine.injectAll(projectRoot, globs, runSeed, merged.exclude);
            const flakeDir = getFlakeMonsterDir(projectRoot);
            await manifest.save(flakeDir);
            lastManifest = manifest;
            reporter.printInjectionStats(manifest);

            // Run tests with spinner
            const spinner = new Spinner(`Run ${i + 1}/${runs}  seed=${runSeed}`);
            if (!reporter.quiet) spinner.start();

            let exitCode, stdout, stderr, durationMs;
            const start = Date.now();
            try {
              ({ exitCode, stdout, stderr } = await execAsync(testCmd, projectRoot));
              durationMs = Date.now() - start;
            } finally {
              if (!reporter.quiet) spinner.stop();
            }

            // Parse test output if we have a runner
            const parsed = runner ? parseTestOutput(runner, stdout) : null;

            const result = {
              runIndex: i,
              seed: runSeed,
              exitCode,
              stdout,
              stderr,
              durationMs,
              workspacePath: projectRoot,
              kept: false,
              parsed: parsed?.parsed ?? false,
              tests: parsed?.tests ?? [],
            };

            reporter.printRunResult(result, runs);
            results.push(result);

            if (i < runs - 1) {
              reporter.printProgressTally(results, runs);
            }
          } else {
            // Create workspace
            const workspace = new ProjectWorkspace({
              sourceDir: projectRoot,
              runId: `run-${i}-seed-${runSeed}`,
            });
            await workspace.create();

            // Inject
            const manifest = await engine.injectAll(workspace.root, globs, runSeed, merged.exclude);
            const flakeDir = getFlakeMonsterDir(workspace.root);
            await manifest.save(flakeDir);
            reporter.printInjectionStats(manifest);

            // Run tests with spinner
            const spinner = new Spinner(`Run ${i + 1}/${runs}  seed=${runSeed}`);
            if (!reporter.quiet) spinner.start();

            let exitCode, stdout, stderr, durationMs;
            const start = Date.now();
            try {
              ({ exitCode, stdout, stderr } = await workspace.execAsync(testCmd));
              durationMs = Date.now() - start;
            } finally {
              if (!reporter.quiet) spinner.stop();
            }

            const failed = exitCode !== 0;
            const shouldKeep = (failed && options.keepOnFail) || options.keepAll;

            // Parse test output if we have a runner
            const parsed = runner ? parseTestOutput(runner, stdout) : null;

            const result = {
              runIndex: i,
              seed: runSeed,
              exitCode,
              stdout,
              stderr,
              durationMs,
              workspacePath: workspace.root,
              kept: shouldKeep,
              parsed: parsed?.parsed ?? false,
              tests: parsed?.tests ?? [],
            };

            reporter.printRunResult(result, runs);
            results.push(result);

            if (i < runs - 1) {
              reporter.printProgressTally(results, runs);
            }

            // Cleanup
            if (!shouldKeep) {
              await workspace.destroy();
            }
          }
        }

        // Restore source files after all in-place runs
        if (inPlace && lastManifest) {
          const restoreResult = await engine.restoreAll(projectRoot, lastManifest);
          reporter.printRestorationResult(restoreResult);
        }

        // Run flakiness analysis if we have parsed results
        const analysis = runner ? analyzeFlakiness(results) : null;
        const totalElapsedMs = Date.now() - harnessTotalStart;

        if (jsonOutput) {
          // JSON output for CI consumption
          const output = {
            version: 1,
            baseSeed,
            runs: results.map(r => ({
              runIndex: r.runIndex,
              seed: r.seed,
              exitCode: r.exitCode,
              durationMs: r.durationMs,
              parsed: r.parsed,
              totalPassed: r.tests.filter(t => t.status === 'passed').length,
              totalFailed: r.tests.filter(t => t.status === 'failed').length,
            })),
            analysis: analysis ?? { totalTests: 0, flakyTests: [], stableTests: [], alwaysFailingTests: [] },
          };
          console.log(JSON.stringify(output));
        } else {
          reporter.summarize(results, runs, analysis, totalElapsedMs);
        }

        // Exit with failure if any run failed
        const anyFailed = results.some((r) => r.exitCode !== 0);
        if (anyFailed) process.exit(1);
      } catch (err) {
        // If in-place mode fails mid-run, still try to restore
        if (!options?.workspace) {
          console.error('\nError during in-place test run. Attempting to restore source files...');
          console.error('If restoration fails, run: flake-monster restore');
        }
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}
