import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CONFIG_FILENAMES = ['.flakemonsterrc.json', 'flakemonster.config.json'];

const DEFAULTS = {
  include: ['src/**/*.js'],
  exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  mode: 'medium',
  minDelayMs: 0,
  maxDelayMs: 50,
  distribution: 'uniform',
  testCommand: 'npm test',
  runs: 10,
  keepOnFail: true,
  skipTryCatch: false,
  skipGenerators: true,
};

/**
 * Load config from project root, merging with defaults.
 * CLI flags override config file values.
 * @param {string} projectRoot
 * @returns {Promise<Object>}
 */
export async function loadConfig(projectRoot) {
  for (const filename of CONFIG_FILENAMES) {
    try {
      const raw = await readFile(join(projectRoot, filename), 'utf-8');
      const fileConfig = JSON.parse(raw);
      return { ...DEFAULTS, ...fileConfig };
    } catch {
      // File doesn't exist or isn't valid JSON — try next
    }
  }
  return { ...DEFAULTS };
}

/**
 * Merge loaded config with CLI options (CLI wins).
 * Only overrides when the user actually passed a flag (value is not undefined).
 * Commander option defaults should be set to undefined so that unpassed flags
 * don't shadow config file values.
 * @param {Object} config
 * @param {Object} cliOptions
 * @returns {Object}
 */
export function mergeWithCliOptions(config, cliOptions) {
  const merged = { ...config };
  if (cliOptions.mode !== undefined) merged.mode = cliOptions.mode;
  if (cliOptions.seed !== undefined) merged.seed = cliOptions.seed;
  if (cliOptions.minDelay !== undefined) merged.minDelayMs = Number(cliOptions.minDelay);
  if (cliOptions.maxDelay !== undefined) merged.maxDelayMs = Number(cliOptions.maxDelay);
  if (cliOptions.cmd !== undefined) merged.testCommand = cliOptions.cmd;
  if (cliOptions.runs !== undefined) merged.runs = Number(cliOptions.runs);
  if (cliOptions.keepOnFail) merged.keepOnFail = true;
  if (cliOptions.keepAll) merged.keepAll = true;
  if (cliOptions.skipTryCatch) merged.skipTryCatch = true;
  if (cliOptions.exclude) {
    merged.exclude = [...new Set([...merged.exclude, ...cliOptions.exclude])];
  }
  return merged;
}
