import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import { parseSource } from './parser.js';
import { computeInjections, computeRuntimeImportInsertion, applyInsertions } from './injector.js';
import { recoverDelays, scanForRecovery } from './remover.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUNTIME_FILENAME = 'flake-monster.runtime.js';

/**
 * Compute the relative import path from a file to the runtime at the project root.
 * e.g. for "src/user.js" -> "../flake-monster.runtime.js"
 *      for "app.js" -> "./flake-monster.runtime.js"
 * @param {string} filePath - relative file path from project root
 * @returns {string}
 */
function computeRuntimeImportPath(filePath) {
  // Count directory depth
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) {
    // File is at root level
    return `./${RUNTIME_FILENAME}`;
  }
  // Go up (parts.length - 1) directories
  const ups = '../'.repeat(parts.length - 1);
  return `${ups}${RUNTIME_FILENAME}`;
}

/**
 * Create the JavaScript language adapter.
 * Handles .js and .mjs files with ESM import/export syntax.
 *
 * @returns {import('../adapter-interface.js').LanguageAdapter}
 */
export function createJavaScriptAdapter() {
  return {
    id: 'javascript',
    displayName: 'JavaScript (ESM)',
    fileExtensions: ['.js', '.mjs'],

    canHandle(filePath) {
      return this.fileExtensions.some((ext) => filePath.endsWith(ext));
    },

    inject(source, options) {
      try {
        const { ast } = parseSource(source);
        const { insertions, points } = computeInjections(ast, source, options);
        const runtimeNeeded = points.length > 0;

        if (runtimeNeeded) {
          const importPath = computeRuntimeImportPath(options.filePath);
          const imp = computeRuntimeImportInsertion(ast, source, importPath);
          if (imp) insertions.push(imp);
        }

        const output = applyInsertions(source, insertions);
        return { source: output, points, runtimeNeeded };
      } catch (err) {
        console.warn(`  Skipping ${options.filePath}: ${err.message}`);
        return { source, points: [], runtimeNeeded: false };
      }
    },

    remove(source) {
      const { source: cleaned, recoveredCount } = recoverDelays(source);
      return { source: cleaned, removedCount: recoveredCount };
    },

    scan(source) {
      return scanForRecovery(source);
    },

    getRuntimeInfo() {
      return {
        runtimeSourcePath: join(__dirname, '..', '..', 'runtime', 'javascript', RUNTIME_FILENAME),
        runtimeFileName: RUNTIME_FILENAME,
      };
    },
  };
}
