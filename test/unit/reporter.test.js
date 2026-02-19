import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { Reporter } from '../../src/core/reporter.js';

/** No-op terminal for predictable test output (no ANSI codes). */
const noopTerminal = {
  bold: (s) => s,
  dim: (s) => s,
  red: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
  progressBar: (c, t) => `[${c}/${t}]`,
  box: (lines) => lines.join('\n'),
};

function makeReporter(quiet = false) {
  return new Reporter({ quiet, terminal: noopTerminal });
}

// Intercept console.log for assertions
let logs;
const origLog = console.log;

function captureStart() {
  logs = [];
  console.log = (...args) => logs.push(args.join(' '));
}

function captureStop() {
  console.log = origLog;
}

describe('Reporter', () => {
  beforeEach(captureStart);
  afterEach(captureStop);

  describe('log', () => {
    it('outputs when not quiet', () => {
      const r = makeReporter(false);
      r.log('hello', 'world');
      assert.strictEqual(logs.length, 1);
      assert.ok(logs[0].includes('hello'));
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.log('hello');
      assert.strictEqual(logs.length, 0);
    });
  });

  describe('printInjectionStats', () => {
    it('prints file count and injection count', () => {
      const r = makeReporter();
      const manifest = {
        getFiles: () => ({ 'a.js': { injections: [1, 2] }, 'b.js': { injections: [3] } }),
        getTotalInjections: () => 3,
      };
      r.printInjectionStats(manifest);
      assert.strictEqual(logs.length, 1);
      assert.ok(logs[0].includes('3'), 'should include injection count');
      assert.ok(logs[0].includes('2 file(s)'), 'should include file count');
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.printInjectionStats({ getFiles: () => ({}), getTotalInjections: () => 0 });
      assert.strictEqual(logs.length, 0);
    });
  });

  describe('printRunResult', () => {
    it('shows PASS for exitCode 0', () => {
      const r = makeReporter();
      r.printRunResult({
        runIndex: 0, seed: 12345, exitCode: 0, durationMs: 2400,
        parsed: false, tests: [],
      }, 5);
      assert.strictEqual(logs.length, 1);
      assert.ok(logs[0].includes('PASS'));
      assert.ok(logs[0].includes('1/5'));
      assert.ok(logs[0].includes('12345'));
      assert.ok(logs[0].includes('2.4s'));
    });

    it('shows FAIL for non-zero exitCode', () => {
      const r = makeReporter();
      r.printRunResult({
        runIndex: 2, seed: 99999, exitCode: 1, durationMs: 5100,
        parsed: false, tests: [],
      }, 10);
      assert.ok(logs[0].includes('FAIL'));
      assert.ok(logs[0].includes('3/10'));
    });

    it('includes parsed test counts when available', () => {
      const r = makeReporter();
      r.printRunResult({
        runIndex: 0, seed: 1, exitCode: 0, durationMs: 1000,
        parsed: true, tests: [
          { name: 'a', status: 'passed' },
          { name: 'b', status: 'passed' },
          { name: 'c', status: 'failed' },
        ],
      }, 1);
      assert.ok(logs[0].includes('2 passed'));
      assert.ok(logs[0].includes('1 failed'));
    });

    it('shows workspace kept note on failure', () => {
      const r = makeReporter();
      r.printRunResult({
        runIndex: 0, seed: 1, exitCode: 1, durationMs: 1000,
        parsed: false, tests: [], kept: true,
      }, 1);
      assert.ok(logs[0].includes('workspace kept'));
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.printRunResult({
        runIndex: 0, seed: 1, exitCode: 0, durationMs: 1000,
        parsed: false, tests: [],
      }, 1);
      assert.strictEqual(logs.length, 0);
    });
  });

  describe('printProgressTally', () => {
    it('shows progress bar and pass/fail counts', () => {
      const r = makeReporter();
      const results = [
        { exitCode: 0 },
        { exitCode: 0 },
        { exitCode: 1 },
      ];
      r.printProgressTally(results, 5);
      const output = logs.join(' ');
      assert.ok(output.includes('[3/5]'), 'should include progress');
      assert.ok(output.includes('2 passed'), 'should include passed count');
      assert.ok(output.includes('1 failed'), 'should include failed count');
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.printProgressTally([], 5);
      assert.strictEqual(logs.length, 0);
    });
  });

  describe('printRestorationResult', () => {
    it('shows files restored count', () => {
      const r = makeReporter();
      r.printRestorationResult({ filesRestored: 42, injectionsRemoved: 100 });
      assert.strictEqual(logs.length, 1);
      assert.ok(logs[0].includes('42'));
      assert.ok(logs[0].includes('restored'));
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.printRestorationResult({ filesRestored: 1, injectionsRemoved: 1 });
      assert.strictEqual(logs.length, 0);
    });
  });

  describe('summarize', () => {
    const baseResults = [
      { runIndex: 0, seed: 111, exitCode: 0, durationMs: 1000, parsed: true, tests: [] },
      { runIndex: 1, seed: 222, exitCode: 1, durationMs: 2000, parsed: true, tests: [], kept: false },
      { runIndex: 2, seed: 333, exitCode: 0, durationMs: 1500, parsed: true, tests: [] },
    ];

    it('shows pass/fail summary', () => {
      const r = makeReporter();
      r.summarize(baseResults, 3);
      const output = logs.join('\n');
      assert.ok(output.includes('2/3 passed'));
      assert.ok(output.includes('1/3 failed'));
    });

    it('includes total elapsed time when provided', () => {
      const r = makeReporter();
      r.summarize(baseResults, 3, null, 65000);
      const output = logs.join('\n');
      assert.ok(output.includes('1m 5s'));
    });

    it('shows seconds for short durations', () => {
      const r = makeReporter();
      r.summarize(baseResults, 3, null, 4500);
      const output = logs.join('\n');
      assert.ok(output.includes('4.5s'));
    });

    it('shows reproduction command on failure', () => {
      const r = makeReporter();
      r.summarize(baseResults, 3);
      const output = logs.join('\n');
      assert.ok(output.includes('Reproduce'));
      assert.ok(output.includes('222'), 'should include failing seed');
    });

    it('shows "No flakes detected" when all pass', () => {
      const r = makeReporter();
      const allPass = [
        { runIndex: 0, seed: 1, exitCode: 0, durationMs: 1000, tests: [] },
        { runIndex: 1, seed: 2, exitCode: 0, durationMs: 1000, tests: [] },
      ];
      r.summarize(allPass, 2);
      const output = logs.join('\n');
      assert.ok(output.includes('No flakes detected'));
    });

    it('includes flaky test details when analysis provided', () => {
      const r = makeReporter();
      const analysis = {
        totalTests: 5,
        flakyTests: [{
          name: 'login test',
          file: 'auth.test.js',
          passedRuns: [0, 2],
          failedRuns: [1],
          flakyRate: 1 / 3,
        }],
        stableTests: [],
        alwaysFailingTests: [],
      };
      r.summarize(baseResults, 3, analysis);
      const output = logs.join('\n');
      assert.ok(output.includes('Flaky tests (1)'));
      assert.ok(output.includes('login test'));
      assert.ok(output.includes('33%'));
    });

    it('includes always-failing tests when present', () => {
      const r = makeReporter();
      const analysis = {
        totalTests: 2,
        flakyTests: [],
        stableTests: [],
        alwaysFailingTests: [{ name: 'broken test', file: 'broken.test.js', verdict: 'always-failing' }],
      };
      r.summarize(baseResults, 3, analysis);
      const output = logs.join('\n');
      assert.ok(output.includes('Always failing'));
      assert.ok(output.includes('broken test'));
    });

    it('suppresses output when quiet', () => {
      const r = makeReporter(true);
      r.summarize(baseResults, 3);
      assert.strictEqual(logs.length, 0);
    });

    it('works without analysis (backward compat)', () => {
      const r = makeReporter();
      // Old call signature: summarize(results, totalRuns)
      r.summarize(baseResults, 3);
      const output = logs.join('\n');
      assert.ok(output.includes('2/3 passed'));
    });
  });
});
