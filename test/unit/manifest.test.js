import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { Manifest, hashContent } from '../../src/core/manifest.js';

describe('Manifest', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `flake-monster-test-${randomBytes(4).toString('hex')}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('tracks file injections', () => {
    const m = new Manifest();
    m.seed = 42;
    m.mode = 'medium';
    m.addFile('src/app.js', 'javascript', 'sha256:aaa', 'sha256:bbb', {
      points: [{ id: '12345', fnName: 'load', index: 0, line: 5 }],
      runtimeNeeded: true,
    });

    assert.strictEqual(m.getTotalInjections(), 1);
    const files = m.getFiles();
    assert.ok(files['src/app.js']);
    assert.strictEqual(files['src/app.js'].adapter, 'javascript');
  });

  it('saves and loads from disk', async () => {
    const m = new Manifest();
    m.seed = 99;
    m.mode = 'hardcore';
    m.addFile('src/a.js', 'javascript', 'sha256:aaa', 'sha256:bbb', {
      points: [{ id: 'abc', fnName: 'foo', index: 0, line: 1 }],
      runtimeNeeded: true,
    });
    m.addRuntimeFile('flake-monster.runtime.js');

    await m.save(tmpDir);

    const loaded = await Manifest.load(tmpDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.seed, 99);
    assert.strictEqual(loaded.mode, 'hardcore');
    assert.strictEqual(loaded.getTotalInjections(), 1);
    assert.deepStrictEqual(loaded.runtimeFiles, ['flake-monster.runtime.js']);
  });

  it('returns null when no manifest exists', async () => {
    const loaded = await Manifest.load(join(tmpDir, 'nonexistent'));
    assert.strictEqual(loaded, null);
  });

  it('checks if file is unmodified', () => {
    const m = new Manifest();
    m.addFile('src/a.js', 'javascript', 'sha256:aaa', 'sha256:bbb', {
      points: [],
      runtimeNeeded: false,
    });

    assert.ok(m.isFileUnmodified('src/a.js', 'sha256:bbb'));
    assert.ok(!m.isFileUnmodified('src/a.js', 'sha256:ccc'));
  });
});

describe('hashContent', () => {
  it('returns consistent sha256 hash', () => {
    const h1 = hashContent('hello world');
    const h2 = hashContent('hello world');
    assert.strictEqual(h1, h2);
    assert.ok(h1.startsWith('sha256:'));
  });

  it('returns different hashes for different content', () => {
    assert.notStrictEqual(hashContent('hello'), hashContent('world'));
  });
});
