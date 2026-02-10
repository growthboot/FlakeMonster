import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { AdapterRegistry } from '../../adapters/registry.js';
import { createJavaScriptAdapter } from '../../adapters/javascript/index.js';
import { InjectorEngine } from '../../core/engine.js';
import { FlakeProfile } from '../../core/profile.js';
import { parseSeed, deriveSeed } from '../../core/seed.js';
import { ProjectWorkspace, getFlakeMonsterDir } from '../../core/workspace.js';
import { loadConfig, mergeWithCliOptions } from '../../core/config.js';
import { Reporter } from '../../core/reporter.js';

function execInDir(command, cwd) {
  try {
    const stdout = execSync(command, {
      cwd,
      env: { ...process.env },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

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

        const profile = FlakeProfile.fromConfig(merged);
        const registry = new AdapterRegistry();
        registry.register(createJavaScriptAdapter());
        const engine = new InjectorEngine(registry, profile);
        const reporter = new Reporter();

        console.log(`FlakeMonster test harness`);
        console.log(`  Runs: ${runs} | Mode: ${profile.mode} | Base seed: ${baseSeed}`);
        console.log(`  Command: ${testCmd}`);
        console.log(`  Patterns: ${globs.join(', ')}`);
        if (inPlace) {
          console.log('  Mode: in-place (source files will be modified and restored)');
        }
        console.log('');

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
            const manifest = await engine.injectAll(projectRoot, globs, runSeed);
            const flakeDir = getFlakeMonsterDir(projectRoot);
            await manifest.save(flakeDir);
            lastManifest = manifest;

            // Run tests in project root
            const start = Date.now();
            const { exitCode, stdout, stderr } = execInDir(testCmd, projectRoot);
            const durationMs = Date.now() - start;

            const result = {
              runIndex: i,
              seed: runSeed,
              exitCode,
              stdout,
              stderr,
              durationMs,
              workspacePath: projectRoot,
              kept: false,
            };

            reporter.printRunResult(result, runs);
            results.push(result);
          } else {
            // Create workspace
            const workspace = new ProjectWorkspace({
              sourceDir: projectRoot,
              runId: `run-${i}-seed-${runSeed}`,
            });
            await workspace.create();

            // Inject
            const manifest = await engine.injectAll(workspace.root, globs, runSeed);
            const flakeDir = getFlakeMonsterDir(workspace.root);
            await manifest.save(flakeDir);

            // Run tests
            const start = Date.now();
            const { exitCode, stdout, stderr } = workspace.exec(testCmd);
            const durationMs = Date.now() - start;

            const failed = exitCode !== 0;
            const shouldKeep = (failed && options.keepOnFail) || options.keepAll;

            const result = {
              runIndex: i,
              seed: runSeed,
              exitCode,
              stdout,
              stderr,
              durationMs,
              workspacePath: workspace.root,
              kept: shouldKeep,
            };

            reporter.printRunResult(result, runs);
            results.push(result);

            // Cleanup
            if (!shouldKeep) {
              await workspace.destroy();
            }
          }
        }

        // Restore source files after all in-place runs
        if (inPlace && lastManifest) {
          await engine.restoreAll(projectRoot, lastManifest);
          console.log('\n  Source files restored to original state.');
        }

        reporter.summarize(results, runs);

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
