import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { AdapterRegistry } from '../../adapters/registry.js';
import { createJavaScriptAdapter } from '../../adapters/javascript/index.js';
import { InjectorEngine } from '../../core/engine.js';
import { FlakeProfile } from '../../core/profile.js';
import { Manifest } from '../../core/manifest.js';
import { getFlakeMonsterDir } from '../../core/workspace.js';
import { loadConfig } from '../../core/config.js';

/**
 * Prompt the user for a yes/no answer.
 * @param {string} question
 * @returns {Promise<boolean>}
 */
function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Print recovery scan results to the terminal.
 * @param {{ file: string, matches: { line: number, content: string, reason: string }[] }[]} scanResults
 */
function printScanResults(scanResults) {
  let totalMatches = 0;

  for (const { file, matches } of scanResults) {
    console.log(`\n  ${file} (${matches.length} match${matches.length === 1 ? '' : 'es'}):`);
    for (const m of matches) {
      const tag = m.reason === 'stamp' ? 'stamp' : m.reason === 'identifier' ? 'ident' : 'import';
      console.log(`    L${m.line} [${tag}] ${m.content.trim()}`);
      totalMatches++;
    }
  }

  console.log(`\n  Total: ${totalMatches} line(s) across ${scanResults.length} file(s)`);
}

export function registerRestoreCommand(program) {
  program
    .command('restore')
    .description('Remove all injected delays and restore original source')
    .option('--in-place', 'Restore in-place modified files (default)', true)
    .option('--recover', 'Interactive scan and confirm, use when traces of injected code remain after a normal restore', false)
    .option('--dir <path>', 'Directory to restore (defaults to project root)')
    .action(async (options) => {
      try {
        const projectRoot = resolve('.');
        const config = await loadConfig(projectRoot);

        const registry = new AdapterRegistry();
        registry.register(createJavaScriptAdapter());

        const targetDir = options.dir ? resolve(options.dir) : projectRoot;
        const flakeDir = getFlakeMonsterDir(targetDir);

        const manifest = await Manifest.load(flakeDir);

        const mode = manifest ? manifest.mode : (config.mode || 'medium');
        const profile = FlakeProfile.fromConfig({ ...config, mode });
        const engine = new InjectorEngine(registry, profile);
        // When no manifest exists, recovery must scan broadly to find all
        // leftover injections — the narrow config.include default (e.g. src/**)
        // may not cover files that were injected with custom CLI globs.
        const globs = manifest
          ? (config.include || ['**/*.js', '**/*.mjs'])
          : ['**/*.js', '**/*.mjs'];
        const exclude = config.exclude || ['**/node_modules/**', '**/dist/**', '**/build/**'];

        if (!manifest && !options.recover) {
          // No manifest — quick-scan to see if there's leftover injected code
          const scanResults = await engine.scanByGlobs(targetDir, globs, exclude);

          if (scanResults.length === 0) {
            console.log('No manifest found and no injected code detected. Nothing to restore.');
            return;
          }

          // Injected code found — offer interactive recovery
          let totalMatches = 0;
          for (const { matches } of scanResults) totalMatches += matches.length;

          console.log(`No manifest found, but detected ${totalMatches} injected line(s) across ${scanResults.length} file(s).`);
          const proceed = await confirm('Run recovery to clean them up? (y/N) ');
          if (!proceed) {
            console.log('Aborted. No files were modified.');
            return;
          }

          // User confirmed — fall through to recovery
          options.recover = true;
        }

        if (options.recover) {
          // Recovery mode: scan first, show results, then confirm
          // Works with or without a manifest
          let scanResults;

          if (manifest) {
            console.log('Recovery mode: scanning manifest files for injected lines...');
            scanResults = await engine.scanAll(targetDir, manifest);
          } else {
            console.log('Scanning all source files...');
            scanResults = await engine.scanByGlobs(targetDir, globs, exclude);
          }

          if (scanResults.length === 0) {
            console.log('No injected lines found. Files appear clean.');
            return;
          }

          printScanResults(scanResults);

          const proceed = await confirm('\n  Remove these lines? (y/N) ');
          if (!proceed) {
            console.log('  Aborted. No files were modified.');
            return;
          }

          if (manifest) {
            const { filesRestored, injectionsRemoved } = await engine.restoreAll(targetDir, manifest);
            await Manifest.delete(flakeDir);
            console.log(`\n  Recovered ${filesRestored} file(s), removed ${injectionsRemoved} line(s)`);
          } else {
            const { filesRestored, injectionsRemoved } = await engine.restoreByGlobs(targetDir, globs, exclude);
            console.log(`\n  Recovered ${filesRestored} file(s), removed ${injectionsRemoved} line(s)`);
          }
        } else {
          const { filesRestored, injectionsRemoved } = await engine.restoreAll(targetDir, manifest);
          await Manifest.delete(flakeDir);

          console.log(`Restored ${filesRestored} file(s), removed ${injectionsRemoved} injection(s)`);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}
