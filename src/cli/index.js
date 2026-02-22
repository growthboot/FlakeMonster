import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { Command } from 'commander';
import { registerInjectCommand } from './commands/inject.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerTestCommand } from './commands/test.js';
import { Manifest } from '../core/manifest.js';
import { getFlakeMonsterDir } from '../core/workspace.js';
import { AdapterRegistry } from '../adapters/registry.js';
import { createJavaScriptAdapter } from '../adapters/javascript/index.js';
import { InjectorEngine } from '../core/engine.js';
import { FlakeProfile } from '../core/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function createCli() {
  const program = new Command();

  program
    .name('flake-monster')
    .description('Source-to-source test hardener, injects async delays to surface flaky tests')
    .version(pkg.version)
    .action(async () => {
      const projectRoot = resolve('.');
      const flakeDir = getFlakeMonsterDir(projectRoot);
      const manifest = await Manifest.load(flakeDir);

      if (manifest) {
        console.log(
          `\nStale injection detected (seed: ${manifest.seed}, mode: ${manifest.mode}, injected at: ${manifest.createdAt}).`
        );
        const proceed = await confirm('Restore source files? (y/N) ');
        if (proceed) {
          const registry = new AdapterRegistry();
          registry.register(createJavaScriptAdapter());
          const profile = FlakeProfile.fromConfig({ mode: manifest.mode });
          const engine = new InjectorEngine(registry, profile);

          const { filesRestored, injectionsRemoved } = await engine.restoreAll(projectRoot, manifest);
          await Manifest.delete(flakeDir);
          console.log(`Restored ${filesRestored} file(s), removed ${injectionsRemoved} injection(s)\n`);
          return;
        }
      }

      program.help();
    });

  registerInjectCommand(program);
  registerRestoreCommand(program);
  registerTestCommand(program);

  return program;
}
