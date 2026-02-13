import { parseJestOutput } from './jest.js';
import { parseNodeTestOutput } from './node-test.js';
import { parseTapOutput } from './tap.js';

const parsers = {
  jest: parseJestOutput,
  'node-test': parseNodeTestOutput,
  tap: parseTapOutput,
};

/**
 * Auto-detect the test runner from the command string.
 * Returns parser key; defaults to 'tap' as a universal fallback.
 */
export function detectRunner(testCommand) {
  if (testCommand.includes('jest') || testCommand.includes('react-scripts test')) {
    return 'jest';
  }
  if (testCommand.includes('node --test') || testCommand.includes('node:test')) {
    return 'node-test';
  }
  return 'tap';
}

/**
 * Parse test runner output using the specified or auto-detected runner.
 * Returns normalized { parsed, tests, totalPassed, totalFailed, totalSkipped }.
 */
export function parseTestOutput(runner, stdout) {
  const parserFn = parsers[runner];
  if (!parserFn) {
    return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
  }

  try {
    return parserFn(stdout);
  } catch {
    return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
  }
}
