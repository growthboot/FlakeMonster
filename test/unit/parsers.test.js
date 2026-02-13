import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseJestOutput } from '../../src/core/parsers/jest.js';
import { parseNodeTestOutput } from '../../src/core/parsers/node-test.js';
import { parseTapOutput } from '../../src/core/parsers/tap.js';
import { detectRunner, parseTestOutput } from '../../src/core/parsers/index.js';

// ─── Jest Parser ───────────────────────────────────────────────

describe('parseJestOutput', () => {
  it('parses a passing test suite', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/src/math.test.js',
        testResults: [
          { fullName: 'adds numbers', status: 'passed', duration: 3, failureMessages: [] },
          { fullName: 'subtracts numbers', status: 'passed', duration: 1, failureMessages: [] },
        ],
      }],
    });

    const result = parseJestOutput(json);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 2);
    assert.strictEqual(result.totalPassed, 2);
    assert.strictEqual(result.totalFailed, 0);
    assert.strictEqual(result.totalSkipped, 0);
    assert.strictEqual(result.tests[0].name, 'adds numbers');
    assert.strictEqual(result.tests[0].file, '/app/src/math.test.js');
    assert.strictEqual(result.tests[0].status, 'passed');
    assert.strictEqual(result.tests[0].durationMs, 3);
    assert.strictEqual(result.tests[0].failureMessage, null);
  });

  it('parses a failing test', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/src/math.test.js',
        testResults: [
          { fullName: 'adds numbers', status: 'passed', duration: 2, failureMessages: [] },
          { fullName: 'divides by zero', status: 'failed', duration: 5, failureMessages: ['Expected 0 but got Infinity'] },
        ],
      }],
    });

    const result = parseJestOutput(json);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.totalPassed, 1);
    assert.strictEqual(result.totalFailed, 1);
    const failed = result.tests.find(t => t.status === 'failed');
    assert.strictEqual(failed.name, 'divides by zero');
    assert.strictEqual(failed.failureMessage, 'Expected 0 but got Infinity');
  });

  it('treats pending tests as skipped', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/src/todo.test.js',
        testResults: [
          { fullName: 'not yet implemented', status: 'pending', duration: 0, failureMessages: [] },
        ],
      }],
    });

    const result = parseJestOutput(json);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.totalSkipped, 1);
    assert.strictEqual(result.tests[0].status, 'skipped');
  });

  it('handles multiple test suites', () => {
    const json = JSON.stringify({
      testResults: [
        {
          testFilePath: '/app/src/a.test.js',
          testResults: [{ fullName: 'test a', status: 'passed', duration: 1, failureMessages: [] }],
        },
        {
          testFilePath: '/app/src/b.test.js',
          testResults: [{ fullName: 'test b', status: 'failed', duration: 2, failureMessages: ['err'] }],
        },
      ],
    });

    const result = parseJestOutput(json);
    assert.strictEqual(result.tests.length, 2);
    assert.strictEqual(result.tests[0].file, '/app/src/a.test.js');
    assert.strictEqual(result.tests[1].file, '/app/src/b.test.js');
  });

  it('returns parsed:false for invalid JSON', () => {
    const result = parseJestOutput('not json');
    assert.strictEqual(result.parsed, false);
    assert.deepStrictEqual(result.tests, []);
  });

  it('returns parsed:false for missing testResults key', () => {
    const result = parseJestOutput(JSON.stringify({ something: 'else' }));
    assert.strictEqual(result.parsed, false);
  });

  it('handles empty test suite', () => {
    const json = JSON.stringify({ testResults: [] });
    const result = parseJestOutput(json);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 0);
  });

  it('handles null duration gracefully', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/test.js',
        testResults: [{ fullName: 'test', status: 'passed', failureMessages: [] }],
      }],
    });
    const result = parseJestOutput(json);
    assert.strictEqual(result.tests[0].durationMs, null);
  });

  it('joins multiple failure messages', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/test.js',
        testResults: [{
          fullName: 'multi-fail',
          status: 'failed',
          duration: 1,
          failureMessages: ['Error 1', 'Error 2'],
        }],
      }],
    });
    const result = parseJestOutput(json);
    assert.strictEqual(result.tests[0].failureMessage, 'Error 1\nError 2');
  });
});

// ─── Node Test Parser ──────────────────────────────────────────

describe('parseNodeTestOutput', () => {
  it('parses passing leaf tests with describes', () => {
    const lines = [
      JSON.stringify({ type: 'test:start', data: { name: 'math', nesting: 0 } }),
      JSON.stringify({ type: 'test:start', data: { name: 'adds', nesting: 1 } }),
      JSON.stringify({ type: 'test:pass', data: { name: 'adds', nesting: 1, details: { duration_ms: 0.5 }, file: 'test/math.test.js' } }),
      JSON.stringify({ type: 'test:pass', data: { name: 'math', nesting: 0, details: { duration_ms: 1.2 }, file: 'test/math.test.js' } }),
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.parsed, true);
    // Should only include leaf test (nesting > 0), not the describe block
    assert.strictEqual(result.tests.length, 1);
    assert.strictEqual(result.tests[0].name, 'adds');
    assert.strictEqual(result.tests[0].status, 'passed');
    assert.strictEqual(result.tests[0].durationMs, 0.5);
    assert.strictEqual(result.totalPassed, 1);
  });

  it('parses failing tests', () => {
    const lines = [
      JSON.stringify({ type: 'test:fail', data: { name: 'broken', nesting: 1, details: { duration_ms: 2.0, error: { message: 'Expected true' } }, file: 'test/broken.test.js' } }),
      JSON.stringify({ type: 'test:pass', data: { name: 'suite', nesting: 0, details: { duration_ms: 3.0 }, file: 'test/broken.test.js' } }),
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(result.tests[0].failureMessage, 'Expected true');
  });

  it('handles flat tests (no describe blocks, all nesting 0)', () => {
    const lines = [
      JSON.stringify({ type: 'test:pass', data: { name: 'test one', nesting: 0, details: { duration_ms: 1 }, file: 'test.js' } }),
      JSON.stringify({ type: 'test:pass', data: { name: 'test two', nesting: 0, details: { duration_ms: 2 }, file: 'test.js' } }),
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.parsed, true);
    // When all tests are nesting 0, treat them all as leaf tests
    assert.strictEqual(result.tests.length, 2);
  });

  it('returns parsed:false for empty input', () => {
    const result = parseNodeTestOutput('');
    assert.strictEqual(result.parsed, false);
  });

  it('skips non-JSON lines', () => {
    const lines = [
      'some stderr noise',
      JSON.stringify({ type: 'test:pass', data: { name: 'works', nesting: 0, details: { duration_ms: 1 }, file: 'test.js' } }),
      'more noise',
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 1);
    assert.strictEqual(result.tests[0].name, 'works');
  });

  it('returns parsed:false when no test events found', () => {
    const lines = [
      JSON.stringify({ type: 'test:start', data: { name: 'starting', nesting: 0 } }),
      JSON.stringify({ type: 'test:plan', data: { nesting: 0, count: 1 } }),
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.parsed, false);
  });

  it('handles error as string', () => {
    const lines = [
      JSON.stringify({ type: 'test:fail', data: { name: 'err-test', nesting: 0, details: { duration_ms: 1, error: 'raw error string' }, file: 'test.js' } }),
    ].join('\n');

    const result = parseNodeTestOutput(lines);
    assert.strictEqual(result.tests[0].failureMessage, 'raw error string');
  });
});

// ─── TAP Parser ───────────────────────────────────────────────

describe('parseTapOutput', () => {
  it('parses basic passing tests', () => {
    const tap = [
      'TAP version 13',
      '1..2',
      'ok 1 - adds numbers',
      'ok 2 - subtracts numbers',
    ].join('\n');

    const result = parseTapOutput(tap);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 2);
    assert.strictEqual(result.totalPassed, 2);
    assert.strictEqual(result.totalFailed, 0);
    assert.strictEqual(result.tests[0].name, 'adds numbers');
    assert.strictEqual(result.tests[0].file, null);
    assert.strictEqual(result.tests[0].durationMs, null);
  });

  it('parses failing tests', () => {
    const tap = 'ok 1 - passes\nnot ok 2 - fails';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.totalPassed, 1);
    assert.strictEqual(result.totalFailed, 1);
    assert.strictEqual(result.tests[1].status, 'failed');
  });

  it('parses YAML diagnostic block for failure messages', () => {
    const tap = [
      'not ok 1 - assertion error',
      '  ---',
      "  message: 'Expected 1 to equal 2'",
      '  severity: fail',
      '  ...',
      'ok 2 - passes',
    ].join('\n');

    const result = parseTapOutput(tap);
    assert.strictEqual(result.tests[0].failureMessage, 'Expected 1 to equal 2');
    assert.strictEqual(result.tests[1].failureMessage, null);
  });

  it('uses full YAML block when no message key', () => {
    const tap = [
      'not ok 1 - error',
      '  ---',
      '  operator: deepEqual',
      '  expected: true',
      '  actual: false',
      '  ...',
    ].join('\n');

    const result = parseTapOutput(tap);
    assert.ok(result.tests[0].failureMessage.includes('operator: deepEqual'));
    assert.ok(result.tests[0].failureMessage.includes('expected: true'));
  });

  it('handles skip directive', () => {
    const tap = 'ok 1 - skipped test # skip not implemented yet';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.tests[0].status, 'skipped');
    assert.strictEqual(result.tests[0].name, 'skipped test');
    assert.strictEqual(result.totalSkipped, 1);
  });

  it('handles SKIP in uppercase', () => {
    const tap = 'ok 1 - skipped test # SKIP';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.tests[0].status, 'skipped');
  });

  it('handles todo directive as skipped', () => {
    const tap = 'not ok 1 - future feature # todo';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.tests[0].status, 'skipped');
    assert.strictEqual(result.totalSkipped, 1);
    assert.strictEqual(result.totalFailed, 0);
  });

  it('returns parsed:false for empty input', () => {
    const result = parseTapOutput('');
    assert.strictEqual(result.parsed, false);
    assert.deepStrictEqual(result.tests, []);
  });

  it('returns parsed:false for non-TAP output', () => {
    const result = parseTapOutput('Some random test runner output\nAll tests passed!');
    assert.strictEqual(result.parsed, false);
  });

  it('works without version or plan lines', () => {
    const tap = 'ok 1 - works';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 1);
  });

  it('handles test lines without test numbers', () => {
    const tap = 'ok - unnumbered test';
    const result = parseTapOutput(tap);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests[0].name, 'unnumbered test');
  });

  it('ignores YAML diagnostic on passing tests', () => {
    const tap = [
      'ok 1 - passes',
      '  ---',
      '  message: some info',
      '  ...',
    ].join('\n');

    const result = parseTapOutput(tap);
    assert.strictEqual(result.tests[0].failureMessage, null);
  });
});

// ─── detectRunner ──────────────────────────────────────────────

describe('detectRunner', () => {
  it('detects jest', () => {
    assert.strictEqual(detectRunner('npx jest --json'), 'jest');
  });

  it('detects react-scripts test as jest', () => {
    assert.strictEqual(detectRunner('react-scripts test --watchAll=false'), 'jest');
  });

  it('detects node --test', () => {
    assert.strictEqual(detectRunner('node --test test/**/*.test.js'), 'node-test');
  });

  it('detects node:test reference', () => {
    assert.strictEqual(detectRunner('some command with node:test'), 'node-test');
  });

  it('returns tap as fallback for unknown commands', () => {
    assert.strictEqual(detectRunner('python -m pytest'), 'tap');
    assert.strictEqual(detectRunner('npm test'), 'tap');
    assert.strictEqual(detectRunner('make test'), 'tap');
  });
});

// ─── parseTestOutput (registry) ────────────────────────────────

describe('parseTestOutput', () => {
  it('routes to jest parser', () => {
    const json = JSON.stringify({
      testResults: [{
        testFilePath: '/app/test.js',
        testResults: [{ fullName: 'a test', status: 'passed', duration: 1, failureMessages: [] }],
      }],
    });
    const result = parseTestOutput('jest', json);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests[0].name, 'a test');
  });

  it('routes to node-test parser', () => {
    const ndjson = JSON.stringify({ type: 'test:pass', data: { name: 'ok', nesting: 0, details: { duration_ms: 1 }, file: 'test.js' } });
    const result = parseTestOutput('node-test', ndjson);
    assert.strictEqual(result.parsed, true);
  });

  it('returns parsed:false for unknown runner', () => {
    const result = parseTestOutput('mocha', 'whatever');
    assert.strictEqual(result.parsed, false);
  });

  it('routes to tap parser', () => {
    const tap = 'ok 1 - a test\nok 2 - another test';
    const result = parseTestOutput('tap', tap);
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.tests.length, 2);
  });

  it('returns parsed:false when parser throws', () => {
    // node-test parser with completely broken input that still looks like it should parse
    const result = parseTestOutput('jest', '{{{{not json');
    assert.strictEqual(result.parsed, false);
  });
});
