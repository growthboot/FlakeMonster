import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { analyzeFlakiness } from '../../src/core/flake-analyzer.js';

describe('analyzeFlakiness', () => {
  it('classifies a test that passes in some runs and fails in others as flaky', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [
        { name: 'login test', file: 'auth.test.js', status: 'passed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 1, parsed: true, tests: [
        { name: 'login test', file: 'auth.test.js', status: 'failed' },
      ]},
      { runIndex: 2, seed: 3, exitCode: 0, parsed: true, tests: [
        { name: 'login test', file: 'auth.test.js', status: 'passed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.flakyTests.length, 1);
    assert.strictEqual(analysis.flakyTests[0].name, 'login test');
    assert.strictEqual(analysis.flakyTests[0].file, 'auth.test.js');
    assert.deepStrictEqual(analysis.flakyTests[0].passedRuns, [0, 2]);
    assert.deepStrictEqual(analysis.flakyTests[0].failedRuns, [1]);
    assert.ok(Math.abs(analysis.flakyTests[0].flakyRate - 1 / 3) < 0.001);
  });

  it('classifies a test that always passes as stable', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [
        { name: 'math add', file: 'math.test.js', status: 'passed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 0, parsed: true, tests: [
        { name: 'math add', file: 'math.test.js', status: 'passed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.stableTests.length, 1);
    assert.strictEqual(analysis.stableTests[0].name, 'math add');
    assert.strictEqual(analysis.stableTests[0].verdict, 'stable-pass');
    assert.strictEqual(analysis.flakyTests.length, 0);
  });

  it('classifies a test that always fails as always-failing', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 1, parsed: true, tests: [
        { name: 'broken test', file: 'broken.test.js', status: 'failed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 1, parsed: true, tests: [
        { name: 'broken test', file: 'broken.test.js', status: 'failed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.alwaysFailingTests.length, 1);
    assert.strictEqual(analysis.alwaysFailingTests[0].name, 'broken test');
    assert.strictEqual(analysis.alwaysFailingTests[0].verdict, 'always-failing');
    assert.strictEqual(analysis.flakyTests.length, 0);
  });

  it('handles a mix of flaky, stable, and always-failing tests', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 1, parsed: true, tests: [
        { name: 'stable', file: 'a.test.js', status: 'passed' },
        { name: 'flaky', file: 'b.test.js', status: 'passed' },
        { name: 'broken', file: 'c.test.js', status: 'failed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 1, parsed: true, tests: [
        { name: 'stable', file: 'a.test.js', status: 'passed' },
        { name: 'flaky', file: 'b.test.js', status: 'failed' },
        { name: 'broken', file: 'c.test.js', status: 'failed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.totalTests, 3);
    assert.strictEqual(analysis.stableTests.length, 1);
    assert.strictEqual(analysis.flakyTests.length, 1);
    assert.strictEqual(analysis.alwaysFailingTests.length, 1);
    assert.strictEqual(analysis.stableTests[0].name, 'stable');
    assert.strictEqual(analysis.flakyTests[0].name, 'flaky');
    assert.strictEqual(analysis.alwaysFailingTests[0].name, 'broken');
  });

  it('ignores skipped tests', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [
        { name: 'skip me', file: 'a.test.js', status: 'skipped' },
        { name: 'real test', file: 'a.test.js', status: 'passed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.totalTests, 1);
    assert.strictEqual(analysis.stableTests[0].name, 'real test');
  });

  it('skips runs with parsed:false', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [
        { name: 'test a', file: 'a.test.js', status: 'passed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 1, parsed: false, tests: [] },
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.totalTests, 1);
    assert.strictEqual(analysis.stableTests.length, 1);
  });

  it('returns empty result for no runs', () => {
    const analysis = analyzeFlakiness([]);
    assert.strictEqual(analysis.totalTests, 0);
    assert.strictEqual(analysis.flakyTests.length, 0);
    assert.strictEqual(analysis.stableTests.length, 0);
    assert.strictEqual(analysis.alwaysFailingTests.length, 0);
  });

  it('sorts flaky tests by flaky rate descending', () => {
    // Both tests must have at least one pass AND one fail to be flaky.
    // high-flake: fails 2/3 runs (67% flaky rate)
    // low-flake: fails 1/3 runs (33% flaky rate)
    const results = [
      { runIndex: 0, seed: 1, exitCode: 1, parsed: true, tests: [
        { name: 'low-flake', file: 'a.test.js', status: 'passed' },
        { name: 'high-flake', file: 'b.test.js', status: 'failed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 1, parsed: true, tests: [
        { name: 'low-flake', file: 'a.test.js', status: 'passed' },
        { name: 'high-flake', file: 'b.test.js', status: 'failed' },
      ]},
      { runIndex: 2, seed: 3, exitCode: 1, parsed: true, tests: [
        { name: 'low-flake', file: 'a.test.js', status: 'failed' },
        { name: 'high-flake', file: 'b.test.js', status: 'passed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.flakyTests.length, 2);
    assert.strictEqual(analysis.flakyTests[0].name, 'high-flake');
    assert.strictEqual(analysis.flakyTests[1].name, 'low-flake');
    assert.ok(analysis.flakyTests[0].flakyRate > analysis.flakyTests[1].flakyRate);
  });

  it('computes correct flaky rate', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [{ name: 't', file: 'f', status: 'passed' }] },
      { runIndex: 1, seed: 2, exitCode: 1, parsed: true, tests: [{ name: 't', file: 'f', status: 'failed' }] },
      { runIndex: 2, seed: 3, exitCode: 0, parsed: true, tests: [{ name: 't', file: 'f', status: 'passed' }] },
      { runIndex: 3, seed: 4, exitCode: 1, parsed: true, tests: [{ name: 't', file: 'f', status: 'failed' }] },
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.flakyTests[0].flakyRate, 0.5);
  });

  it('tracks file from first occurrence', () => {
    const results = [
      { runIndex: 0, seed: 1, exitCode: 0, parsed: true, tests: [
        { name: 'test', file: 'src/a.test.js', status: 'passed' },
      ]},
      { runIndex: 1, seed: 2, exitCode: 0, parsed: true, tests: [
        { name: 'test', file: 'src/a.test.js', status: 'passed' },
      ]},
    ];

    const analysis = analyzeFlakiness(results);
    assert.strictEqual(analysis.stableTests[0].file, 'src/a.test.js');
  });
});
