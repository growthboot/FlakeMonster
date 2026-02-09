import { Command } from 'commander';
import { registerInjectCommand } from './commands/inject.js';
import { registerRestoreCommand } from './commands/restore.js';
import { registerTestCommand } from './commands/test.js';

export function createCli() {
  const program = new Command();

  program
    .name('flake-monster')
    .description('Source-to-source test hardener — injects async delays to surface flaky tests')
    .version('0.1.0');

  registerInjectCommand(program);
  registerRestoreCommand(program);
  registerTestCommand(program);

  return program;
}
