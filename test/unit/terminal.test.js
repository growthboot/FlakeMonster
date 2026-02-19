import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  supportsColor,
  resetColorCache,
  isTTY,
  bold, dim, red, green, yellow, cyan,
  stripAnsi,
  progressBar,
  box,
  Spinner,
} from '../../src/cli/terminal.js';

describe('supportsColor', () => {
  const origNoColor = process.env.NO_COLOR;
  const origForceColor = process.env.FORCE_COLOR;

  afterEach(() => {
    // Restore env
    if (origNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = origNoColor;
    if (origForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = origForceColor;
    resetColorCache();
  });

  it('returns false when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    delete process.env.FORCE_COLOR;
    resetColorCache();
    assert.strictEqual(supportsColor(), false);
  });

  it('returns true when FORCE_COLOR is set', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    resetColorCache();
    assert.strictEqual(supportsColor(), true);
  });

  it('caches the result across calls', () => {
    process.env.FORCE_COLOR = '1';
    delete process.env.NO_COLOR;
    resetColorCache();
    const first = supportsColor();
    const second = supportsColor();
    assert.strictEqual(first, second);
  });
});

describe('ANSI color wrappers', () => {
  const origNoColor = process.env.NO_COLOR;
  const origForceColor = process.env.FORCE_COLOR;

  afterEach(() => {
    if (origNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = origNoColor;
    if (origForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = origForceColor;
    resetColorCache();
  });

  it('returns plain string when NO_COLOR is set', () => {
    process.env.NO_COLOR = '1';
    delete process.env.FORCE_COLOR;
    resetColorCache();
    assert.strictEqual(bold('hello'), 'hello');
    assert.strictEqual(dim('hello'), 'hello');
    assert.strictEqual(red('hello'), 'hello');
    assert.strictEqual(green('hello'), 'hello');
    assert.strictEqual(yellow('hello'), 'hello');
    assert.strictEqual(cyan('hello'), 'hello');
  });

  it('wraps with ANSI codes when FORCE_COLOR is set', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    resetColorCache();
    const result = red('error');
    assert.ok(result.includes('\x1b[31m'), 'should include red open code');
    assert.ok(result.includes('\x1b[39m'), 'should include color reset');
    assert.ok(result.includes('error'), 'should include the original text');
  });
});

describe('stripAnsi', () => {
  it('removes ANSI escape codes', () => {
    assert.strictEqual(stripAnsi('\x1b[31mhello\x1b[39m'), 'hello');
    assert.strictEqual(stripAnsi('\x1b[1m\x1b[31mbold red\x1b[39m\x1b[22m'), 'bold red');
  });

  it('returns plain strings unchanged', () => {
    assert.strictEqual(stripAnsi('hello world'), 'hello world');
  });

  it('handles empty string', () => {
    assert.strictEqual(stripAnsi(''), '');
  });
});

describe('progressBar', () => {
  it('renders an empty bar', () => {
    const result = progressBar(0, 10, 10);
    assert.ok(result.includes('0/10'));
    // 0 filled, 10 empty
    assert.strictEqual(result.split('\u2588').length - 1, 0); // no filled blocks
    assert.strictEqual(result.split('\u2591').length - 1, 10); // 10 empty blocks
  });

  it('renders a full bar', () => {
    const result = progressBar(10, 10, 10);
    assert.ok(result.includes('10/10'));
    assert.strictEqual(result.split('\u2588').length - 1, 10); // 10 filled
    assert.strictEqual(result.split('\u2591').length - 1, 0); // no empty
  });

  it('renders a partial bar', () => {
    const result = progressBar(3, 10, 10);
    assert.ok(result.includes('3/10'));
    assert.strictEqual(result.split('\u2588').length - 1, 3);
    assert.strictEqual(result.split('\u2591').length - 1, 7);
  });

  it('handles zero total gracefully', () => {
    const result = progressBar(0, 0, 10);
    assert.ok(result.includes('0/0'));
  });
});

describe('box', () => {
  it('wraps lines in box-drawing characters', () => {
    const result = box(['Hello', 'World']);
    assert.ok(result.includes('\u250c'), 'top-left corner');
    assert.ok(result.includes('\u2510'), 'top-right corner');
    assert.ok(result.includes('\u2514'), 'bottom-left corner');
    assert.ok(result.includes('\u2518'), 'bottom-right corner');
    assert.ok(result.includes('\u2502 Hello'), 'left border with content');
    assert.ok(result.includes('\u2502 World'), 'left border with content');
  });

  it('pads shorter lines to match longest', () => {
    const result = box(['Hi', 'Hello World']);
    const lines = result.split('\n');
    // All body lines should be the same visual width
    const bodyLines = lines.filter(l => l.includes('\u2502'));
    assert.strictEqual(bodyLines.length, 2);
    assert.strictEqual(bodyLines[0].length, bodyLines[1].length);
  });

  it('handles ANSI codes when computing width', () => {
    const result = box(['\x1b[31mRed\x1b[39m', 'Plain']);
    // Should not break — ANSI codes are stripped for width calculation
    assert.ok(result.includes('\u250c'));
  });
});

describe('Spinner', () => {
  it('tracks elapsed time', async () => {
    const spinner = new Spinner('test');
    spinner._startTime = Date.now() - 500;
    const elapsed = spinner.stop();
    assert.ok(elapsed >= 400, `elapsed ${elapsed} should be >= 400`);
    assert.ok(elapsed < 1000, `elapsed ${elapsed} should be < 1000`);
  });

  it('stop returns 0 when never started', () => {
    const spinner = new Spinner('test');
    const elapsed = spinner.stop();
    assert.strictEqual(elapsed, 0);
  });
});
