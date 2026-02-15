import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AdapterRegistry } from '../../src/adapters/registry.js';
import { createJavaScriptAdapter } from '../../src/adapters/javascript/index.js';
import { InjectorEngine } from '../../src/core/engine.js';
import { FlakeProfile } from '../../src/core/profile.js';

describe('Engine manifest-free recovery (scanByGlobs / restoreByGlobs)', () => {
  let tmpDir;
  let engine;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'fm-recovery-'));
    await mkdir(join(tmpDir, 'src'), { recursive: true });

    const registry = new AdapterRegistry();
    registry.register(createJavaScriptAdapter());
    const profile = FlakeProfile.fromConfig({ mode: 'medium' });
    engine = new InjectorEngine(registry, profile);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('scanByGlobs finds injected code across files', async () => {
    // Write injected files
    await writeFile(
      join(tmpDir, 'src', 'a.js'),
      [
        'import { __FlakeMonster__ } from "../flake-monster.runtime.js";',
        'async function foo() {',
        '  /* @flake-monster[jt92-se2j!] v1 */',
        '  await __FlakeMonster__(23);',
        '  return 1;',
        '}',
      ].join('\n'),
    );

    await writeFile(
      join(tmpDir, 'src', 'b.js'),
      [
        'import { __FlakeMonster__ } from "../flake-monster.runtime.js";',
        'async function bar() {',
        '  /* @flake-monster[jt92-se2j!] v1 */',
        '  await __FlakeMonster__(47);',
        '  return 2;',
        '}',
      ].join('\n'),
    );

    // Write a clean file
    await writeFile(
      join(tmpDir, 'src', 'clean.js'),
      'function clean() { return 42; }\n',
    );

    const results = await engine.scanByGlobs(tmpDir, ['src/**/*.js']);

    assert.strictEqual(results.length, 2, 'should find 2 injected files');
    const files = results.map((r) => r.file).sort();
    assert.deepStrictEqual(files, ['src/a.js', 'src/b.js']);

    for (const r of results) {
      assert.ok(r.matches.length > 0, `${r.file} should have matches`);
    }
  });

  it('scanByGlobs returns empty for clean files', async () => {
    await writeFile(
      join(tmpDir, 'src', 'clean.js'),
      'async function clean() { return await fetch("/api"); }\n',
    );

    const results = await engine.scanByGlobs(tmpDir, ['src/**/*.js']);
    assert.strictEqual(results.length, 0);
  });

  it('scanByGlobs respects exclude patterns', async () => {
    await writeFile(
      join(tmpDir, 'src', 'a.js'),
      'async function foo() {\n  await __FlakeMonster__(23);\n  return 1;\n}\n',
    );

    await mkdir(join(tmpDir, 'node_modules'), { recursive: true });
    await writeFile(
      join(tmpDir, 'node_modules', 'bad.js'),
      'async function evil() {\n  await __FlakeMonster__(99);\n}\n',
    );

    const results = await engine.scanByGlobs(tmpDir, ['**/*.js'], ['**/node_modules/**']);
    const files = results.map((r) => r.file);
    assert.ok(!files.some((f) => f.includes('node_modules')), 'should exclude node_modules');
  });

  it('restoreByGlobs removes injected code from files', async () => {
    const injectedSource = [
      'import { __FlakeMonster__ } from "../flake-monster.runtime.js";',
      'async function foo() {',
      '  /* @flake-monster[jt92-se2j!] v1 */',
      '  await __FlakeMonster__(23);',
      '  const x = await fetch("/api");',
      '  return x;',
      '}',
    ].join('\n');

    await writeFile(join(tmpDir, 'src', 'a.js'), injectedSource);

    const { filesRestored, injectionsRemoved } = await engine.restoreByGlobs(tmpDir, ['src/**/*.js']);

    assert.strictEqual(filesRestored, 1);
    assert.ok(injectionsRemoved > 0);

    const cleaned = await readFile(join(tmpDir, 'src', 'a.js'), 'utf-8');
    assert.ok(!cleaned.includes('__FlakeMonster__'), 'no identifier after restore');
    assert.ok(!cleaned.includes('jt92-se2j!'), 'no stamp after restore');
    assert.ok(!cleaned.includes('flake-monster.runtime'), 'no runtime import after restore');
    assert.ok(cleaned.includes('const x = await fetch'), 'preserves real code');
  });

  it('restoreByGlobs skips clean files (no unnecessary writes)', async () => {
    const cleanSource = 'async function clean() { return await fetch("/api"); }\n';
    await writeFile(join(tmpDir, 'src', 'clean.js'), cleanSource);

    const { filesRestored, injectionsRemoved } = await engine.restoreByGlobs(tmpDir, ['src/**/*.js']);

    assert.strictEqual(filesRestored, 0, 'should not touch clean files');
    assert.strictEqual(injectionsRemoved, 0);

    const afterRestore = await readFile(join(tmpDir, 'src', 'clean.js'), 'utf-8');
    assert.strictEqual(afterRestore, cleanSource, 'file should be unchanged');
  });

  it('restoreByGlobs cleans up runtime files', async () => {
    await writeFile(
      join(tmpDir, 'flake-monster.runtime.js'),
      'export const __FlakeMonster__ = (ms) => new Promise(r => setTimeout(r, ms));\n',
    );
    await writeFile(
      join(tmpDir, 'src', 'a.js'),
      'import { __FlakeMonster__ } from "../flake-monster.runtime.js";\nasync function f() {\n  await __FlakeMonster__(10);\n}\n',
    );

    await engine.restoreByGlobs(tmpDir, ['src/**/*.js']);

    // Runtime file should be cleaned up
    let runtimeExists = true;
    try {
      await readFile(join(tmpDir, 'flake-monster.runtime.js'));
    } catch {
      runtimeExists = false;
    }
    assert.ok(!runtimeExists, 'runtime file should be deleted');
  });

  it('scanByGlobs with broad globs finds injections outside src/', async () => {
    // Simulate a project like FSCode: code lives in components/, modules/, etc.
    await mkdir(join(tmpDir, 'components', 'App'), { recursive: true });
    await mkdir(join(tmpDir, 'modules', 'Store'), { recursive: true });

    await writeFile(
      join(tmpDir, 'components', 'App', 'App.js'),
      [
        'import { __FlakeMonster__ } from "../../flake-monster.runtime.js";',
        'async function connectedCallback() {',
        '  /* @flake-monster[jt92-se2j!] v1 */',
        '  await __FlakeMonster__(23);',
        '  this.render();',
        '}',
      ].join('\n'),
    );

    await writeFile(
      join(tmpDir, 'modules', 'Store', 'Store.js'),
      [
        'import { __FlakeMonster__ } from "../../flake-monster.runtime.js";',
        'export async function init() {',
        '  /* @flake-monster[jt92-se2j!] v1 */',
        '  await __FlakeMonster__(47);',
        '  return {};',
        '}',
      ].join('\n'),
    );

    // Narrow glob (src/**) should find nothing — these files aren't in src/
    const narrowResults = await engine.scanByGlobs(tmpDir, ['src/**/*.js']);
    assert.strictEqual(narrowResults.length, 0, 'narrow src glob misses non-src files');

    // Broad glob (**/*.js) should find both
    const broadResults = await engine.scanByGlobs(tmpDir, ['**/*.js'], ['**/node_modules/**']);
    assert.strictEqual(broadResults.length, 2, 'broad glob finds files outside src/');
    const files = broadResults.map((r) => r.file).sort();
    assert.deepStrictEqual(files, ['components/App/App.js', 'modules/Store/Store.js']);
  });

  it('restoreByGlobs recovers files outside src/ with broad globs', async () => {
    await mkdir(join(tmpDir, 'behaviors', 'Drag'), { recursive: true });

    const injected = [
      'import { __FlakeMonster__ } from "../../flake-monster.runtime.js";',
      'export async function onDrag(e) {',
      '  /* @flake-monster[jt92-se2j!] v1 */',
      '  await __FlakeMonster__(15);',
      '  this.update(e);',
      '}',
    ].join('\n');

    await writeFile(join(tmpDir, 'behaviors', 'Drag', 'Drag.js'), injected);
    await writeFile(
      join(tmpDir, 'flake-monster.runtime.js'),
      'export const __FlakeMonster__ = (ms) => new Promise(r => setTimeout(r, ms));\n',
    );

    // Narrow glob misses it
    const narrow = await engine.restoreByGlobs(tmpDir, ['src/**/*.js']);
    assert.strictEqual(narrow.filesRestored, 0, 'narrow glob restores nothing');

    // Broad glob recovers it
    const broad = await engine.restoreByGlobs(tmpDir, ['**/*.js'], ['**/node_modules/**']);
    assert.strictEqual(broad.filesRestored, 1);
    assert.ok(broad.injectionsRemoved > 0);

    const cleaned = await readFile(join(tmpDir, 'behaviors', 'Drag', 'Drag.js'), 'utf-8');
    assert.ok(!cleaned.includes('__FlakeMonster__'), 'injection removed');
    assert.ok(cleaned.includes('this.update(e)'), 'original code preserved');
  });

  it('end-to-end: inject via engine, then recover without manifest', async () => {
    // Write original source files
    const originalA = [
      'export async function loadUser(id) {',
      '  const resp = await fetch(`/users/${id}`);',
      '  return resp.json();',
      '}',
    ].join('\n');

    const originalB = [
      'export async function saveUser(user) {',
      '  await fetch("/users", { method: "POST", body: JSON.stringify(user) });',
      '}',
    ].join('\n');

    await writeFile(join(tmpDir, 'src', 'a.js'), originalA);
    await writeFile(join(tmpDir, 'src', 'b.js'), originalB);

    // Inject using the engine (creates manifest, but we'll ignore it)
    const manifest = await engine.injectAll(tmpDir, ['src/**/*.js'], 42);
    assert.ok(manifest.getTotalInjections() > 0, 'precondition: injections happened');

    // Verify files are injected
    const injectedA = await readFile(join(tmpDir, 'src', 'a.js'), 'utf-8');
    assert.ok(injectedA.includes('__FlakeMonster__'), 'precondition: a.js is injected');

    // Now recover WITHOUT the manifest — purely glob-based
    const scan = await engine.scanByGlobs(tmpDir, ['src/**/*.js']);
    assert.ok(scan.length > 0, 'scan should find injected files');

    const { filesRestored, injectionsRemoved } = await engine.restoreByGlobs(tmpDir, ['src/**/*.js']);
    assert.ok(filesRestored > 0, 'should restore files');
    assert.ok(injectionsRemoved > 0, 'should remove injections');

    // Verify files are clean
    const cleanedA = await readFile(join(tmpDir, 'src', 'a.js'), 'utf-8');
    const cleanedB = await readFile(join(tmpDir, 'src', 'b.js'), 'utf-8');

    assert.ok(!cleanedA.includes('__FlakeMonster__'), 'a.js clean');
    assert.ok(!cleanedB.includes('__FlakeMonster__'), 'b.js clean');
    assert.ok(cleanedA.includes('loadUser'), 'preserves original code');
    assert.ok(cleanedB.includes('saveUser'), 'preserves original code');
  });
});
