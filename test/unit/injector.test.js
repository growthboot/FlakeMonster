import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJavaScriptAdapter } from '../../src/adapters/javascript/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

const adapter = createJavaScriptAdapter();

describe('JavaScript adapter — inject', () => {
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

    assert.ok(result.source.includes('__FlakeMonster__.delay'), 'should contain __FlakeMonster__.delay calls');
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

  it('skips files with no async functions', async () => {
    const source = await readFile(join(FIXTURES, 'no-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'test/fixtures/no-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.strictEqual(result.points.length, 0, 'no injections for sync-only files');
    assert.strictEqual(result.runtimeNeeded, false);
    assert.ok(!result.source.includes('__FlakeMonster__.delay'), 'no delay calls');
  });

  it('embeds seed and file path in delay calls', async () => {
    const source = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');
    const result = adapter.inject(source, {
      filePath: 'src/user.js',
      mode: 'light',
      seed: 921,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(result.source.includes('seed: 921'), 'should embed the seed');
    assert.ok(result.source.includes('"src/user.js"'), 'should embed the file path');
  });
});
