import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import fg from 'fast-glob';
import { Manifest, hashContent } from './manifest.js';

/**
 * Language-agnostic injection orchestrator.
 * Routes files to the correct adapter and manages manifests.
 * Never touches ASTs directly, all parsing/manipulation is in adapters.
 */
export class InjectorEngine {
  /**
   * @param {import('../adapters/registry.js').AdapterRegistry} registry
   * @param {import('./profile.js').FlakeProfile} profile
   */
  constructor(registry, profile) {
    this.registry = registry;
    this.profile = profile;
  }

  /**
   * Inject delays into all matching files in a directory.
   * @param {string} rootDir - Directory to process (workspace or project root)
   * @param {string[]} globs - File patterns to process
   * @param {number} seed
   * @param {string[]} [exclude=[]] - Glob patterns to exclude
   * @returns {Promise<Manifest>}
   */
  async injectAll(rootDir, globs, seed, exclude = []) {
    const manifest = new Manifest();
    manifest.seed = seed;
    manifest.mode = this.profile.mode;

    // Resolve globs to file list
    const files = await fg(globs, { cwd: rootDir, absolute: false, ignore: exclude });

    const adaptersUsed = new Set();
    let totalInjections = 0;

    for (const filePath of files) {
      const adapter = this.registry.getAdapterForFile(filePath);
      if (!adapter) continue;

      const absPath = join(rootDir, filePath);
      const source = await readFile(absPath, 'utf-8');
      const originalHash = hashContent(source);

      const options = this.profile.toInjectOptions(filePath, seed);
      const result = adapter.inject(source, options);

      if (result.points.length === 0) continue;

      await writeFile(absPath, result.source, 'utf-8');
      const modifiedHash = hashContent(result.source);

      manifest.addFile(filePath, adapter.id, originalHash, modifiedHash, result);
      totalInjections += result.points.length;
      adaptersUsed.add(adapter.id);
    }

    // Copy runtime files for each adapter used
    for (const adapterId of adaptersUsed) {
      const adapter = this.registry.getAdapter(adapterId);
      const info = adapter.getRuntimeInfo();
      const destPath = join(rootDir, info.runtimeFileName);
      await copyFile(info.runtimeSourcePath, destPath);
      manifest.addRuntimeFile(info.runtimeFileName);
    }

    return manifest;
  }

  /**
   * Scan files for recovery matches without modifying anything.
   * Returns per-file match results for preview before recovery.
   * @param {string} rootDir
   * @param {Manifest} manifest
   * @returns {Promise<{ file: string, matches: { line: number, content: string, reason: string }[] }[]>}
   */
  async scanAll(rootDir, manifest) {
    const results = [];
    const files = manifest.getFiles();

    for (const [filePath, entry] of Object.entries(files)) {
      const adapter = this.registry.getAdapter(entry.adapter);
      if (!adapter || !adapter.scan) continue;

      const absPath = join(rootDir, filePath);
      let source;
      try {
        source = await readFile(absPath, 'utf-8');
      } catch {
        continue;
      }

      const matches = adapter.scan(source);
      if (matches.length > 0) {
        results.push({ file: filePath, matches });
      }
    }

    return results;
  }

  /**
   * Scan files by glob patterns for recovery matches (no manifest needed).
   * Discovers files via fast-glob and routes them through registered adapters.
   * @param {string} rootDir
   * @param {string[]} globs - File patterns to scan
   * @param {string[]} [exclude=[]] - Glob patterns to exclude
   * @returns {Promise<{ file: string, matches: { line: number, content: string, reason: string }[] }[]>}
   */
  async scanByGlobs(rootDir, globs, exclude = []) {
    const results = [];
    const files = await fg(globs, { cwd: rootDir, absolute: false, ignore: exclude });

    for (const filePath of files) {
      const adapter = this.registry.getAdapterForFile(filePath);
      if (!adapter || !adapter.scan) continue;

      const absPath = join(rootDir, filePath);
      let source;
      try {
        source = await readFile(absPath, 'utf-8');
      } catch {
        continue;
      }

      const matches = adapter.scan(source);
      if (matches.length > 0) {
        results.push({ file: filePath, matches });
      }
    }

    return results;
  }

  /**
   * Remove injections from files discovered by glob patterns (no manifest needed).
   * @param {string} rootDir
   * @param {string[]} globs - File patterns to process
   * @param {string[]} [exclude=[]] - Glob patterns to exclude
   * @returns {Promise<{ filesRestored: number, injectionsRemoved: number }>}
   */
  async restoreByGlobs(rootDir, globs, exclude = []) {
    let filesRestored = 0;
    let injectionsRemoved = 0;

    const files = await fg(globs, { cwd: rootDir, absolute: false, ignore: exclude });

    for (const filePath of files) {
      const adapter = this.registry.getAdapterForFile(filePath);
      if (!adapter) continue;

      const absPath = join(rootDir, filePath);
      let source;
      try {
        source = await readFile(absPath, 'utf-8');
      } catch {
        continue;
      }

      const result = adapter.remove(source);
      if (result.removedCount === 0) continue;

      await writeFile(absPath, result.source, 'utf-8');
      filesRestored++;
      injectionsRemoved += result.removedCount;
    }

    // Clean up runtime files
    const { unlink } = await import('node:fs/promises');
    const runtimeFiles = await fg(['**/flake-monster.runtime.*'], {
      cwd: rootDir,
      absolute: false,
      ignore: exclude,
    });
    for (const rf of runtimeFiles) {
      try {
        await unlink(join(rootDir, rf));
      } catch {
        // Already gone
      }
    }

    return { filesRestored, injectionsRemoved };
  }

  /**
   * Remove all injections from files listed in the manifest.
   * @param {string} rootDir
   * @param {Manifest} manifest
   * @returns {Promise<{ filesRestored: number, injectionsRemoved: number }>}
   */
  async restoreAll(rootDir, manifest) {
    let filesRestored = 0;
    let injectionsRemoved = 0;

    const files = manifest.getFiles();

    for (const [filePath, entry] of Object.entries(files)) {
      const adapter = this.registry.getAdapter(entry.adapter);
      if (!adapter) {
        console.warn(`No adapter found for "${entry.adapter}", skipping ${filePath}`);
        continue;
      }

      const absPath = join(rootDir, filePath);
      let source;
      try {
        source = await readFile(absPath, 'utf-8');
      } catch {
        console.warn(`File not found: ${filePath}, skipping`);
        continue;
      }

      // Verify file hasn't been manually modified
      const currentHash = hashContent(source);
      if (!manifest.isFileUnmodified(filePath, currentHash)) {
        console.warn(`Warning: ${filePath} was modified after injection. Restoring anyway.`);
      }

      const result = adapter.remove(source);
      await writeFile(absPath, result.source, 'utf-8');
      filesRestored++;
      injectionsRemoved += result.removedCount;
    }

    // Remove runtime files
    const { unlink } = await import('node:fs/promises');
    for (const runtimeFile of manifest.runtimeFiles) {
      try {
        await unlink(join(rootDir, runtimeFile));
      } catch {
        // Already gone
      }
    }

    return { filesRestored, injectionsRemoved };
  }
}
