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
 * @param {Object} config
 * @param {Object} cliOptions
 * @returns {Object}
 */
export function mergeWithCliOptions(config, cliOptions) {
  const merged = { ...config };
  if (cliOptions.mode) merged.mode = cliOptions.mode;
  if (cliOptions.seed) merged.seed = cliOptions.seed;
  if (cliOptions.minDelay) merged.minDelayMs = Number(cliOptions.minDelay);
  if (cliOptions.maxDelay) merged.maxDelayMs = Number(cliOptions.maxDelay);
  if (cliOptions.cmd) merged.testCommand = cliOptions.cmd;
  if (cliOptions.runs) merged.runs = Number(cliOptions.runs);
  if (cliOptions.keepOnFail) merged.keepOnFail = true;
  if (cliOptions.keepAll) merged.keepAll = true;
  if (cliOptions.skipTryCatch) merged.skipTryCatch = true;
  return merged;
}
