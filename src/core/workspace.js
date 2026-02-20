import { rm, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const FLAKE_MONSTER_DIR = '.flake-monster';
const WORKSPACES_DIR = 'workspaces';

/** Default directories/patterns to exclude when copying. */
const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  '.flake-monster',
  'dist',
  'build',
  '.next',
  'coverage',
];

/**
 * Manages a temporary workspace copy of the project for safe injection.
 */
export class ProjectWorkspace {
  /**
   * @param {Object} options
   * @param {string} options.sourceDir - Absolute path to original project root
   * @param {string} [options.runId] - Unique identifier for this run
   * @param {string[]} [options.exclude] - Directory names to skip
   */
  constructor(options) {
    this.sourceDir = options.sourceDir;
    this.runId = options.runId || `run-${Date.now()}-${randomBytes(3).toString('hex')}`;
    this.exclude = options.exclude || DEFAULT_EXCLUDE;
    this._root = join(this.sourceDir, FLAKE_MONSTER_DIR, WORKSPACES_DIR, this.runId);
    this._created = false;
  }

  /** Absolute path to workspace root. */
  get root() {
    return this._root;
  }

  /**
   * Copy project files into the workspace.
   * Uses a filter to skip excluded directories.
   * @returns {Promise<string>} absolute path to workspace root
   */
  async create() {
    await mkdir(this._root, { recursive: true });

    const excludeSet = new Set(this.exclude);

    // Manual recursive copy to avoid fs.cp's "cannot copy into subdirectory of self" check.
    // This is needed because .flake-monster/workspaces/ lives inside the project root.
    await this._copyDir(this.sourceDir, this._root, excludeSet);

    // Symlink node_modules from source so tests can run
    try {
      const { symlinkSync } = await import('node:fs');
      const sourceModules = join(this.sourceDir, 'node_modules');
      const targetModules = join(this._root, 'node_modules');
      symlinkSync(sourceModules, targetModules, 'junction');
    } catch {
      // node_modules may not exist, that's fine
    }

    this._created = true;
    return this._root;
  }

  /**
   * Recursively copy a directory, skipping excluded names.
   * @param {string} src
   * @param {string} dest
   * @param {Set<string>} excludeSet
   */
  async _copyDir(src, dest, excludeSet) {
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (excludeSet.has(entry.name)) continue;

      const srcPath = join(src, entry.name);
      const destPath = join(dest, entry.name);

      if (entry.isDirectory()) {
        await mkdir(destPath, { recursive: true });
        await this._copyDir(srcPath, destPath, excludeSet);
      } else if (entry.isFile()) {
        await copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Execute a shell command inside the workspace.
   * @param {string} command
   * @param {Object} [options]
   * @param {number} [options.timeout] - ms before killing the process
   * @param {Object} [options.env] - additional env vars
   * @returns {{ exitCode: number, stdout: string, stderr: string }}
   */
  exec(command, options = {}) {
    const { timeout, env } = options;
    try {
      const stdout = execSync(command, {
        cwd: this._root,
        timeout,
        env: { ...process.env, ...env },
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (err) {
      return {
        exitCode: err.status ?? 1,
        stdout: err.stdout || '',
        stderr: err.stderr || '',
      };
    }
  }

  /**
   * Execute a shell command inside the workspace asynchronously.
   * Unlike exec(), this does not block the event loop, allowing spinners to animate.
   * @param {string} command
   * @param {Object} [options]
   * @param {number} [options.timeout] - ms before killing the process
   * @param {Object} [options.env] - additional env vars
   * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
   */
  execAsync(command, options = {}) {
    return execAsync(command, this._root, options);
  }

  /**
   * Delete the workspace directory.
   */
  async destroy() {
    await rm(this._root, { recursive: true, force: true });
    this._created = false;
  }
}

/**
 * Get the .flake-monster directory path for a project.
 * @param {string} projectRoot
 * @returns {string}
 */
export function getFlakeMonsterDir(projectRoot) {
  return join(projectRoot, FLAKE_MONSTER_DIR);
}

/**
 * Execute a shell command asynchronously without blocking the event loop.
 * @param {string} command
 * @param {string} cwd - Working directory
 * @param {Object} [options]
 * @param {number} [options.timeout] - ms before killing the process
 * @param {Object} [options.env] - additional env vars
 * @param {Function} [options.onStdout] - Callback for each stdout chunk (receives Buffer)
 * @param {Function} [options.onStderr] - Callback for each stderr chunk (receives Buffer)
 * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
 */
export function execAsync(command, cwd, options = {}) {
  return new Promise((resolve) => {
    const { timeout, env, onStdout, onStderr } = options;
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
      if (onStdout) onStdout(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
      if (onStderr) onStderr(chunk);
    });

    let timer;
    if (timeout) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeout);
    }

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: err.message,
      });
    });
  });
}
