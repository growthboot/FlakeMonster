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
        if (!manifest) {
          console.log('No manifest found. Nothing to restore.');
          console.log(`Looked in: ${flakeDir}`);
          return;
        }

        const profile = FlakeProfile.fromConfig({ ...config, mode: manifest.mode });
        const engine = new InjectorEngine(registry, profile);

        if (options.recover) {
          // Recovery mode: scan first, show results, then confirm
          console.log('Recovery mode: scanning for injected lines...');

          const scanResults = await engine.scanAll(targetDir, manifest);

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

          const { filesRestored, injectionsRemoved } = await engine.restoreAll(targetDir, manifest);
          await Manifest.delete(flakeDir);

          console.log(`\n  Recovered ${filesRestored} file(s), removed ${injectionsRemoved} line(s)`);
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
