import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJavaScriptAdapter } from '../../src/adapters/javascript/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

const adapter = createJavaScriptAdapter();

describe('JavaScript adapter — remove', () => {
  it('removes all injected delays and runtime import', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    // Inject first
    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(injected.source.includes('__FlakeMonster__.delay'), 'precondition: has delays');
    assert.ok(injected.source.includes('flake-monster.runtime'), 'precondition: has import');

    // Now remove
    const restored = adapter.remove(injected.source);

    assert.ok(!restored.source.includes('__FlakeMonster__.delay'), 'no delay calls after removal');
    assert.ok(!restored.source.includes('flake-monster.runtime'), 'no runtime import after removal');
    assert.ok(!restored.source.includes('jt92-se2j!'), 'no stamp after removal');
    assert.ok(restored.removedCount > 0, 'should report removed count');
  });

  it('roundtrip: inject then remove preserves original code', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    // Inject
    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'medium',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // Remove
    const restored = adapter.remove(injected.source);

    // Verify no injected code remains
    assert.ok(!restored.source.includes('__FlakeMonster__'), 'no identifier after roundtrip');
    assert.ok(!restored.source.includes('flake-monster.runtime'), 'no runtime import after roundtrip');
    assert.ok(!restored.source.includes('jt92-se2j!'), 'no stamp after roundtrip');

    // Verify original code survived
    assert.ok(restored.source.includes('loadUser'), 'preserves loadUser function');
    assert.ok(restored.source.includes('saveUser'), 'preserves saveUser function');
    assert.ok(restored.source.includes('fetchData'), 'preserves fetchData calls');
  });

  it('does nothing to files with no injections', async () => {
    const source = await readFile(join(FIXTURES, 'no-async.js'), 'utf-8');

    const result = adapter.remove(source);
    assert.strictEqual(result.removedCount, 0);
  });
});

describe('JavaScript adapter — scan (recovery preview)', () => {
  it('finds injected lines without modifying source', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const matches = adapter.scan(injected.source);

    assert.ok(matches.length > 0, 'should find matches');
    // Every match should have line, content, and reason
    for (const m of matches) {
      assert.ok(typeof m.line === 'number', 'match has line number');
      assert.ok(typeof m.content === 'string', 'match has content');
      assert.ok(['stamp', 'identifier', 'runtime-import'].includes(m.reason), `valid reason: ${m.reason}`);
    }
  });

  it('classifies stamp, identifier, and runtime-import matches', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const matches = adapter.scan(injected.source);
    const reasons = new Set(matches.map((m) => m.reason));

    // Injected code has marker comments (stamp), delay calls (identifier), and runtime import
    assert.ok(reasons.has('stamp'), 'should find stamp matches (marker comments)');
    assert.ok(reasons.has('identifier'), 'should find identifier matches (delay calls)');
    assert.ok(reasons.has('runtime-import'), 'should find runtime-import match');
  });

  it('returns empty array for clean files', async () => {
    const source = await readFile(join(FIXTURES, 'no-async.js'), 'utf-8');
    const matches = adapter.scan(source);
    assert.strictEqual(matches.length, 0);
  });

  it('scan count matches recover count', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const scanMatches = adapter.scan(injected.source);
    const recovered = adapter.remove(injected.source);

    assert.strictEqual(scanMatches.length, recovered.removedCount, 'scan and recover should agree on count');
  });
});

describe('JavaScript adapter — remove (resilience)', () => {
  it('removes injected lines via text matching', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    const recovered = adapter.remove(injected.source);

    assert.ok(!recovered.source.includes('__FlakeMonster__.delay'), 'no delay calls after recovery');
    assert.ok(!recovered.source.includes('flake-monster.runtime'), 'no runtime import after recovery');
    assert.ok(!recovered.source.includes('jt92-se2j!'), 'no stamp after recovery');
    assert.ok(recovered.removedCount > 0, 'should report removed count');
  });

  it('removes mangled code with broken syntax', () => {
    // Simulate AI-mangled code: broken syntax but still has our identifiers
    const mangled = [
      'import { __FlakeMonster__ } from "./flake-monster.runtime.js";',
      'async function foo() {',
      '  /* @flake-monster[jt92-se2j!] v1 id=abc seed=42 mode=hardcore */',
      '  await __FlakeMonster__.delay({ seed: 42, file: "x.js", fn: "foo", n: 0 })',  // missing semicolon
      '  const x = await fetch("/api");',
      '  /* some mangled comment jt92-se2j! leftover */',
      '  return x;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(mangled);

    assert.ok(!recovered.source.includes('__FlakeMonster__'), 'no identifier after recovery');
    assert.ok(!recovered.source.includes('jt92-se2j!'), 'no stamp after recovery');
    assert.ok(!recovered.source.includes('flake-monster.runtime'), 'no runtime import after recovery');
    assert.ok(recovered.source.includes('const x = await fetch'), 'preserves real code');
    assert.ok(recovered.source.includes('return x;'), 'preserves return statement');
    assert.strictEqual(recovered.removedCount, 4, 'should remove 4 lines (import, comment, delay, mangled comment)');
  });

  it('recovers when AI rewrites comments but stamp fragment survives', () => {
    // AI "helpfully" rewrote the comment but the stamp substring persists
    const corrupted = [
      'async function bar() {',
      '  // The following was added by flake-monster tool (jt92-se2j!) for testing delays',
      '  await doWork();',
      '  /* NOTE: this block is related to jt92-se2j! injection framework */',
      '  return 42;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(corrupted);

    assert.ok(!recovered.source.includes('jt92-se2j!'), 'stamp fragments removed');
    assert.ok(recovered.source.includes('await doWork()'), 'preserves real await');
    assert.ok(recovered.source.includes('return 42'), 'preserves return');
    assert.strictEqual(recovered.removedCount, 2, 'removes both corrupted comment lines');
  });

  it('recovers when AI reformats delay call but identifier survives', () => {
    // AI split or reformatted the delay call, but it's all on one line with await + identifier
    const corrupted = [
      'async function baz() {',
      '  await __FlakeMonster__.delay({seed:42,file:"f.js",fn:"baz",n:0});  // added for test flakiness',
      '  await __FlakeMonster__ . delay( { seed: 42, file: "f.js" , fn: "baz", n: 1 } )',
      '  const data = await loadData();',
      '  return data;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(corrupted);

    assert.ok(!recovered.source.includes('__FlakeMonster__'), 'identifier removed');
    assert.ok(recovered.source.includes('const data = await loadData()'), 'preserves real code');
    assert.strictEqual(recovered.removedCount, 2, 'removes both reformatted delay lines');
  });

  it('recovers when AI changes import style but runtime path survives', () => {
    const corrupted = [
      '// AI converted to require style but kept the path',
      'import __FlakeMonster__ from "./flake-monster.runtime.js";',
      'import   {__FlakeMonster__}   from   "../flake-monster.runtime.js"  ;',
      'async function go() {',
      '  const x = 1;',
      '  return x;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(corrupted);

    assert.ok(!recovered.source.includes('flake-monster.runtime'), 'runtime imports removed');
    assert.ok(recovered.source.includes('const x = 1'), 'preserves real code');
    assert.strictEqual(recovered.removedCount, 2, 'removes both mangled import lines');
  });

  it('recovers when linter strips all comments and reformats delay calls', () => {
    // Linter removed all block comments (no stamp left) and reformatted
    // the delay call across multiple lines
    const linted = [
      'import { __FlakeMonster__ } from "./flake-monster.runtime.js";',
      'import { fetchData } from "./api.js";',
      '',
      'async function loadUser(id) {',
      '  await __FlakeMonster__.delay({',
      '    seed: 42,',
      '    file: "src/user.js",',
      '    fn: "loadUser",',
      '    n: 0,',
      '  });',
      '  const user = await fetchData(`/users/${id}`);',
      '  return user;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(linted);

    assert.ok(!recovered.source.includes('__FlakeMonster__'), 'identifier removed');
    assert.ok(!recovered.source.includes('flake-monster.runtime'), 'runtime import removed');
    assert.ok(!recovered.source.includes('seed: 42'), 'no orphaned object properties');
    assert.ok(recovered.source.includes('const user = await fetchData'), 'preserves real code');
    assert.ok(recovered.source.includes('return user;'), 'preserves return');
    // import(1) + delay call across 6 lines (await...delay({ through });)
    assert.strictEqual(recovered.removedCount, 7, 'removes import + entire multi-line delay call');
  });

  it('recovers multi-line delay with scan/recover count agreement', () => {
    const linted = [
      'import { __FlakeMonster__ } from "./flake-monster.runtime.js";',
      'async function foo() {',
      '  await __FlakeMonster__.delay({',
      '    seed: 1,',
      '    file: "a.js",',
      '    fn: "foo",',
      '    n: 0,',
      '  });',
      '  return true;',
      '}',
    ].join('\n');

    const scanMatches = adapter.scan(linted);
    const recovered = adapter.remove(linted);

    assert.strictEqual(scanMatches.length, recovered.removedCount, 'scan and recover agree on multi-line');
  });

  it('end-to-end: inject real code, strip all block comments (simulate lint), recover', async () => {
    const original = await readFile(join(FIXTURES, 'simple-async.js'), 'utf-8');

    // Inject with hardcore mode (max injections)
    const injected = adapter.inject(original, {
      filePath: 'test/fixtures/simple-async.js',
      mode: 'hardcore',
      seed: 42,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    assert.ok(injected.source.includes('jt92-se2j!'), 'precondition: has stamps');

    // Simulate linter: strip all block comments (removes every stamp)
    const linted = injected.source
      .split('\n')
      .filter((line) => !line.trim().startsWith('/*'))
      .join('\n');

    assert.ok(!linted.includes('jt92-se2j!'), 'precondition: linting removed all stamps');
    assert.ok(linted.includes('__FlakeMonster__'), 'precondition: delay calls survive linting');

    // Recovery should still clean everything up via identifier + multi-line tracking
    const recovered = adapter.remove(linted);

    assert.ok(!recovered.source.includes('__FlakeMonster__'), 'no identifier after recovery');
    assert.ok(!recovered.source.includes('flake-monster.runtime'), 'no runtime import after recovery');
    assert.ok(!recovered.source.includes('jt92-se2j!'), 'no stamp after recovery');
    assert.ok(recovered.removedCount > 0, 'should have removed lines');

    // Original code should survive
    assert.ok(recovered.source.includes('fetchData'), 'preserves fetchData calls');
    assert.ok(recovered.source.includes('loadUser'), 'preserves loadUser function');
    assert.ok(recovered.source.includes('saveUser'), 'preserves saveUser function');
    assert.ok(recovered.source.includes("console.log('saved')"), 'preserves console.log');
  });

  it('does not false-positive on code that references __FlakeMonster__ without calling .delay()', () => {
    // Test/assertion code that mentions the identifier in strings, args, or comments
    const testCode = [
      'import { strict as assert } from "node:assert";',
      '',
      'async function testRecovery() {',
      '  const result = await checkFor("__FlakeMonster__");',
      '  assert.ok(result.source.includes("__FlakeMonster__"));',
      '  const name = "__FlakeMonster__";',
      '  console.log("__FlakeMonster__ is active");',
      '  const x = await something(__FlakeMonster__);',
      '  // Check if __FlakeMonster__ is loaded',
      '  return result;',
      '}',
    ].join('\n');

    const recovered = adapter.remove(testCode);

    assert.strictEqual(recovered.removedCount, 0, 'should not remove any lines');
    assert.strictEqual(recovered.source, testCode, 'source should be unchanged');
  });

  it('does nothing to files with no injected lines', async () => {
    const source = await readFile(join(FIXTURES, 'no-async.js'), 'utf-8');

    const recovered = adapter.remove(source);
    assert.strictEqual(recovered.removedCount, 0);
  });
});
