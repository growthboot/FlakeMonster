import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRng, hashString, deriveSeed, randomSeed, parseSeed } from '../../src/core/seed.js';

describe('createRng', () => {
  it('produces deterministic output for the same seed', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const values1 = Array.from({ length: 10 }, () => rng1());
    const values2 = Array.from({ length: 10 }, () => rng2());
    assert.deepStrictEqual(values1, values2);
  });

  it('produces different output for different seeds', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);
    const v1 = rng1();
    const v2 = rng2();
    assert.notStrictEqual(v1, v2);
  });

  it('produces values in [0, 1)', () => {
    const rng = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
    }
  });
});

describe('hashString', () => {
  it('returns consistent hash for same input', () => {
    assert.strictEqual(hashString('hello'), hashString('hello'));
  });

  it('returns different hashes for different inputs', () => {
    assert.notStrictEqual(hashString('hello'), hashString('world'));
  });

  it('returns a number', () => {
    assert.strictEqual(typeof hashString('test'), 'number');
  });
});

describe('deriveSeed', () => {
  it('returns different seeds for different contexts', () => {
    const s1 = deriveSeed(42, 'src/a.js:foo:0');
    const s2 = deriveSeed(42, 'src/a.js:foo:1');
    assert.notStrictEqual(s1, s2);
  });

  it('returns different seeds for different base seeds', () => {
    const s1 = deriveSeed(42, 'src/a.js:foo:0');
    const s2 = deriveSeed(99, 'src/a.js:foo:0');
    assert.notStrictEqual(s1, s2);
  });
});

describe('parseSeed', () => {
  it('returns a number for numeric input', () => {
    assert.strictEqual(parseSeed('42'), 42);
    assert.strictEqual(parseSeed(42), 42);
  });

  it('returns a random seed for "auto"', () => {
    const s = parseSeed('auto');
    assert.strictEqual(typeof s, 'number');
  });

  it('throws for invalid input', () => {
    assert.throws(() => parseSeed('not-a-number'), /Invalid seed/);
  });
});
