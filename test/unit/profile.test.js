import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { FlakeProfile } from '../../src/core/profile.js';

describe('FlakeProfile', () => {
  it('uses sensible defaults', () => {
    const p = new FlakeProfile();
    assert.strictEqual(p.mode, 'medium');
    assert.strictEqual(p.minDelayMs, 0);
    assert.strictEqual(p.maxDelayMs, 50);
    assert.strictEqual(p.distribution, 'uniform');
    assert.strictEqual(p.skipTryCatch, false);
    assert.strictEqual(p.skipGenerators, true);
  });

  it('accepts custom options', () => {
    const p = new FlakeProfile({ mode: 'hardcore', maxDelayMs: 200 });
    assert.strictEqual(p.mode, 'hardcore');
    assert.strictEqual(p.maxDelayMs, 200);
  });

  it('throws on invalid mode', () => {
    assert.throws(() => new FlakeProfile({ mode: 'turbo' }), /Invalid mode/);
  });

  it('throws if maxDelayMs < minDelayMs', () => {
    assert.throws(() => new FlakeProfile({ minDelayMs: 100, maxDelayMs: 50 }), /maxDelayMs/);
  });

  it('generates inject options', () => {
    const p = new FlakeProfile({ mode: 'light' });
    const opts = p.toInjectOptions('src/app.js', 42);
    assert.strictEqual(opts.filePath, 'src/app.js');
    assert.strictEqual(opts.mode, 'light');
    assert.strictEqual(opts.seed, 42);
    assert.strictEqual(opts.delayConfig.minMs, 0);
    assert.strictEqual(opts.delayConfig.maxMs, 50);
  });

  it('creates from config object', () => {
    const p = FlakeProfile.fromConfig({ mode: 'hardcore', minDelayMs: 5, maxDelayMs: 100 });
    assert.strictEqual(p.mode, 'hardcore');
    assert.strictEqual(p.minDelayMs, 5);
  });
});
