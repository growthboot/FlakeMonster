import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { Command } from 'commander';
import { registerInjectCommand } from './commands/inject.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerTestCommand } from './commands/test.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8'));

export function createCli() {
  const program = new Command();

  program
    .name('flake-monster')
    .description('Source-to-source test hardener, injects async delays to surface flaky tests')
    .version(pkg.version);

  registerInjectCommand(program);
  registerRestoreCommand(program);
  registerTestCommand(program);

  return program;
}
