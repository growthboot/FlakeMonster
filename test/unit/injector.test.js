import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJavaScriptAdapter } from '../../src/adapters/javascript/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

const adapter = createJavaScriptAdapter();

describe('JavaScript adapter, inject', () => {
  it('injects delays into async function bodies (medium mode)', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(result.source.includes('__FlakeMonster__('), 'should contain __FlakeMonster__() calls');
    assert.ok(result.source.includes('flake-monster.runtime'), 'should have runtime import');
    assert.ok(result.runtimeNeeded, 'runtimeNeeded should be true');
    assert.ok(result.points.length > 0, 'should have injection points');

    // Medium mode: should NOT inject before return statements
    // loadUser has 3 statements: const user, const profile, return
    // Should inject before const user and const profile, not before return
    const loadUserPoints = result.points.filter((p) => p.fnName === 'loadUser');
    assert.strictEqual(loadUserPoints.length, 2, 'loadUser should have 2 injections in medium mode');

    // saveUser has 3 statements: const result, console.log, return
    // Should inject before const result and console.log, not before return
    const saveUserPoints = result.points.filter((p) => p.fnName === 'saveUser');
    assert.strictEqual(saveUserPoints.length, 2, 'saveUser should have 2 injections in medium mode');
  });

  it('injects only at top in light mode', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'light',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const loadUserPoints = result.points.filter((p) => p.fnName === 'loadUser');
    assert.strictEqual(loadUserPoints.length, 1, 'light mode: one injection per function');

    const saveUserPoints = result.points.filter((p) => p.fnName === 'saveUser');
    assert.strictEqual(saveUserPoints.length, 1, 'light mode: one injection per function');
  });

  it('injects before every statement in hardcore mode', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // loadUser: 3 statements (const user, const profile, return) = 3 injections
    const loadUserPoints = result.points.filter((p) => p.fnName === 'loadUser');
    assert.strictEqual(loadUserPoints.length, 3, 'hardcore: inject before every statement including return');
  });

  it('handles arrow functions with block bodies', async () => {
    const source = await readFile(join(FIXTURES, 'arrow-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/arrow-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // The block-body arrow has 3 statements: const items, const filtered, return
    // Medium skips return, so 2 injections
    const arrowPoints = result.points.filter((p) => p.fnName === '<arrow>');
    assert.strictEqual(arrowPoints.length, 2, 'should inject into block-body arrows');
  });

  it('injects top-level delays even in files with no async functions', async () => {
    const source = await readFile(join(FIXTURES, 'no-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/no-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // no-async.js has 3 top-level statements: function, const, export
    // All get top-level injection in medium mode (none are return/throw)
    const topLevelPoints = result.points.filter((p) => p.fnName === '<top-level>');
    assert.strictEqual(topLevelPoints.length, 3, 'should inject at top level');
    assert.ok(result.runtimeNeeded, 'runtimeNeeded should be true');

    // No function body injections (no async functions)
    const fnPoints = result.points.filter((p) => p.fnName !== '<top-level>');
    assert.strictEqual(fnPoints.length, 0, 'no function body injections');
  });

  it('embeds delay ms values directly in calls', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'src/user.js',
      mode: 'light',
      seed: 921,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // Each injection point should have a delayMs in the metadata
    for (const point of result.points) {
      assert.ok(typeof point.delayMs === 'number', 'point should have delayMs');
      assert.ok(point.delayMs >= 0 && point.delayMs <= 50, `delayMs ${point.delayMs} in range`);
      // The delay value should appear in the generated source
      assert.ok(result.source.includes(`__FlakeMonster__(${point.delayMs})`), `source should contain __FlakeMonster__(${point.delayMs})`);
    }
  });

  it('produces deterministic delays from the same seed', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const opts = {
      filePath: 'src/user.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    };

    const result1 = adapter.inject(source, opts);
    const result2 = adapter.inject(source, opts);

    assert.deepStrictEqual(
      result1.points.map((p) => p.delayMs),
      result2.points.map((p) => p.delayMs),
      'same seed should produce identical delays',
    );
  });

  it('injects delays at module top-level (medium mode)', async () => {
    const source = await readFile(join(FIXTURES, 'top-level-await.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/top-level-await.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(result.source.includes('__FlakeMonster__('), 'should contain delay calls');
    assert.ok(result.runtimeNeeded, 'runtimeNeeded should be true');

    // top-level-await.js has 4 non-import top-level statements:
    // const config, const user, console.log, export
    // None are return/throw, so all 4 get injected in medium mode
    const topLevelPoints = result.points.filter((p) => p.fnName === '<top-level>');
    assert.strictEqual(topLevelPoints.length, 4, 'should have 4 top-level injections');

    // No function body injections (no async functions in file)
    const fnPoints = result.points.filter((p) => p.fnName !== '<top-level>');
    assert.strictEqual(fnPoints.length, 0, 'no function body injections');
  });

  it('injects at top-level in light mode (first statement only)', async () => {
    const source = await readFile(join(FIXTURES, 'top-level-await.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/top-level-await.js',
      mode: 'light',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const topLevelPoints = result.points.filter((p) => p.fnName === '<top-level>');
    assert.strictEqual(topLevelPoints.length, 1, 'light mode: one top-level injection');
  });

  it('injects at top-level AND inside async functions together', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // simple-async.js has:
    // - 3 top-level non-import statements (loadUser fn, saveUser fn, export)
    // - 2 injections in loadUser body + 2 in saveUser body
    const topLevelPoints = result.points.filter((p) => p.fnName === '<top-level>');
    assert.strictEqual(topLevelPoints.length, 3, 'should have 3 top-level injections');

    const loadUserPoints = result.points.filter((p) => p.fnName === 'loadUser');
    assert.strictEqual(loadUserPoints.length, 2, 'loadUser body still gets 2 injections');

    const saveUserPoints = result.points.filter((p) => p.fnName === 'saveUser');
    assert.strictEqual(saveUserPoints.length, 2, 'saveUser body still gets 2 injections');

    assert.strictEqual(result.points.length, 7, 'total: 3 top-level + 2 + 2 function body');
  });

  it('handles classes with uninitialized fields (PropertyDefinition value: null)', async () => {
    const source = await readFile(join(FIXTURES, 'class-fields.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/class-fields.js',
      mode: 'light',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(result.source.includes('__FlakeMonster__('), 'should inject delays');
    // light mode: 1 top-level (before class) + 1 inside async loadUser
    assert.strictEqual(result.points.length, 2, 'should have 2 injection points');
  });

  it('places runtime import before a leading block comment (no existing imports)', async () => {
    const source = await readFile(join(FIXTURES, 'leading-jsdoc.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/leading-jsdoc.js',
      mode: 'light',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(result.source.includes('__FlakeMonster__('), 'should contain delay calls');
    assert.ok(result.runtimeNeeded, 'runtimeNeeded should be true');

    // The import MUST come before the block comment, not inside it
    const importIndex = result.source.indexOf("import { __FlakeMonster__ }");
    const commentIndex = result.source.indexOf('/**');
    assert.ok(importIndex >= 0, 'should have runtime import');
    assert.ok(commentIndex >= 0, 'should still have the JSDoc comment');
    assert.ok(importIndex < commentIndex, 'import must appear before the leading block comment');
  });

  it('skips already-injected files (idempotency)', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const opts = {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'light',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    };

    const first = adapter.inject(source, opts);
    assert.ok(first.points.length > 0, 'first injection should produce points');

    // Second injection on already-injected source should be a no-op
    const second = adapter.inject(first.source, opts);
    assert.strictEqual(second.points.length, 0, 'second injection should produce zero points');
    assert.strictEqual(second.source, first.source, 'source should be unchanged');
  });
});
