import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const MANIFEST_VERSION = 1;
const MANIFEST_FILENAME = 'manifest.json';

/**
 * Tracks all injections for reliable removal and reporting.
 * Stored at .flake-monster/manifest.json (or inside a workspace).
 */
export class Manifest {
  constructor() {
    this.version = MANIFEST_VERSION;
    this.createdAt = new Date().toISOString();
    this.seed = null;
    this.mode = null;
    this.files = {};
    this.runtimeFiles = [];
  }

  /**
   * Record injection results for a file.
   * @param {string} relativePath - path relative to project/workspace root
   * @param {string} adapterId - e.g. "javascript"
   * @param {string} originalHash - hash of original source
   * @param {string} modifiedHash - hash of modified source
   * @param {Object} result - InjectionResult from adapter
   */
  addFile(relativePath, adapterId, originalHash, modifiedHash, result) {
    this.files[relativePath] = {
      adapter: adapterId,
      originalHash,
      modifiedHash,
      injections: result.points,
      runtimeImportAdded: result.runtimeNeeded,
    };
  }

  /**
   * Add a runtime file that was copied into the project/workspace.
   * @param {string} relativePath
   */
  addRuntimeFile(relativePath) {
    if (!this.runtimeFiles.includes(relativePath)) {
      this.runtimeFiles.push(relativePath);
    }
  }

  /** Get all tracked file entries. */
  getFiles() {
    return this.files;
  }

  /** Get the total number of injections across all files. */
  getTotalInjections() {
    let total = 0;
    for (const entry of Object.values(this.files)) {
      total += entry.injections.length;
    }
    return total;
  }

  /**
   * Check if a file's current content matches what we wrote during injection.
   * @param {string} currentHash
   * @param {string} relativePath
   * @returns {boolean}
   */
  isFileUnmodified(relativePath, currentHash) {
    const entry = this.files[relativePath];
    if (!entry) return false;
    return entry.modifiedHash === currentHash;
  }

  /**
   * Save manifest to disk.
   * @param {string} dirPath - directory to write manifest.json in
   */
  async save(dirPath) {
    const filePath = join(dirPath, MANIFEST_FILENAME);
    await mkdir(dirname(filePath), { recursive: true });
    const data = {
      version: this.version,
      createdAt: this.createdAt,
      seed: this.seed,
      mode: this.mode,
      files: this.files,
      runtimeFiles: this.runtimeFiles,
    };
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load manifest from disk. Returns null if no manifest exists.
   * @param {string} dirPath
   * @returns {Promise<Manifest|null>}
   */
  static async load(dirPath) {
    const filePath = join(dirPath, MANIFEST_FILENAME);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const manifest = new Manifest();
      manifest.version = data.version;
      manifest.createdAt = data.createdAt;
      manifest.seed = data.seed;
      manifest.mode = data.mode;
      manifest.files = data.files || {};
      manifest.runtimeFiles = data.runtimeFiles || [];
      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Delete manifest file.
   * @param {string} dirPath
   */
  static async delete(dirPath) {
    try {
      await unlink(join(dirPath, MANIFEST_FILENAME));
    } catch {
      // Already gone
    }
  }
}

/**
 * Compute SHA-256 hash of a string (for file content tracking).
 * @param {string} content
 * @returns {string}
 */
export function hashContent(content) {
  return 'sha256:' + createHash('sha256').update(content, 'utf-8').digest('hex');
}
