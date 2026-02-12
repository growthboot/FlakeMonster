import { simple } from 'acorn-walk';
import { deriveSeed, createRng } from '../../core/seed.js';

const MARKER_PREFIX = '@flake-monster[jt92-se2j!] v1';
const DELAY_OBJECT = '__FlakeMonster__';

/**
 * Compute the delay (in ms) for a specific injection point.
 * Uses the same deterministic derivation as before, but now runs at
 * injection time so the value is embedded directly in the source.
 * @param {number} seed
 * @param {string} filePath
 * @param {string} fnName
 * @param {number} index
 * @param {{ minMs: number, maxMs: number }} delayConfig
 * @returns {number}
 */
function computeDelayMs(seed, filePath, fnName, index, delayConfig) {
  const context = `${filePath}:${fnName}:${index}`;
  const contextSeed = deriveSeed(seed, context);
  const rng = createRng(contextSeed);
  const lo = delayConfig.minMs ?? 0;
  const hi = delayConfig.maxMs ?? 50;
  return Math.round(lo + rng() * (hi - lo));
}

/**
 * Build an AST node for the marker block comment.
 * @returns {Object}
 */
function createMarkerComment() {
  return {
    type: 'Block',
    value: MARKER_PREFIX,
  };
}

/**
 * Build the AST for: await __FlakeMonster__(delayMs)
 * Returns an ExpressionStatement node with the marker comment attached.
 * @param {number} delayMs
 * @param {Object} comment - the marker comment to attach
 * @returns {Object}
 */
function createDelayStatement(delayMs, comment) {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'AwaitExpression',
      argument: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: DELAY_OBJECT },
        arguments: [{ type: 'Literal', value: delayMs }],
      },
    },
    comments: [comment],
  };
}

/**
 * Decide whether to inject a delay before a given statement based on mode.
 * @param {string} mode
 * @param {Object} stmt - AST statement node
 * @param {number} index - position in the function body
 * @returns {boolean}
 */
function shouldInject(mode, stmt, index) {
  if (mode === 'light') {
    return index === 0;
  }
  if (mode === 'medium') {
    return stmt.type !== 'ReturnStatement' && stmt.type !== 'ThrowStatement';
  }
  if (mode === 'hardcore') {
    return true;
  }
  return false;
}

/**
 * Get a human-readable name for a function node.
 * @param {Object} node
 * @returns {string}
 */
function getFnName(node) {
  if (node.id && node.id.name) return node.id.name;
  return '<anonymous>';
}

/**
 * Process an array of statements: build a new array with delay statements spliced in.
 * @param {Object[]} bodyArray - array of AST statement nodes
 * @param {string} fnName - context name for seed derivation
 * @param {Object} options - inject options
 * @returns {{ newBody: Object[], points: Object[] }}
 */
function processStatements(bodyArray, fnName, options) {
  const points = [];
  const newBody = [];
  let injectionIndex = 0;

  for (let i = 0; i < bodyArray.length; i++) {
    const stmt = bodyArray[i];

    if (shouldInject(options.mode, stmt, i)) {
      const delayMs = computeDelayMs(
        options.seed,
        options.filePath,
        fnName,
        injectionIndex,
        options.delayConfig,
      );
      const comment = createMarkerComment();
      const delayStmt = createDelayStatement(delayMs, comment);

      newBody.push(delayStmt);

      points.push({
        fnName,
        index: injectionIndex,
        delayMs,
        line: stmt.loc?.start.line ?? 0,
        column: stmt.loc?.start.column ?? 0,
      });

      injectionIndex++;
    }

    newBody.push(stmt);
  }

  return { newBody, points };
}

/**
 * Process a single async function body: splice delay statements into its body array.
 * @param {Object} fnNode
 * @param {string} fnName
 * @param {Object} options - inject options
 * @returns {Object[]} injection points
 */
function processBody(fnNode, fnName, options) {
  const { newBody, points } = processStatements(fnNode.body.body, fnName, options);
  fnNode.body.body = newBody;
  return points;
}

/**
 * Process top-level (module scope) statements: inject delays between non-import statements.
 * Top-level await is valid in ES modules, so we can inject `await __FlakeMonster__(N)`
 * at the module level just like inside async function bodies.
 * @param {Object} ast - ESTree Program node
 * @param {Object} options - inject options
 * @returns {Object[]} injection points
 */
function processTopLevel(ast, options) {
  // Find where imports end
  let firstNonImport = 0;
  for (let i = 0; i < ast.body.length; i++) {
    if (ast.body[i].type === 'ImportDeclaration') {
      firstNonImport = i + 1;
    } else {
      break;
    }
  }

  const stmts = ast.body.slice(firstNonImport);
  if (stmts.length === 0) return [];

  const { newBody, points } = processStatements(stmts, '<top-level>', options);
  ast.body = [...ast.body.slice(0, firstNonImport), ...newBody];
  return points;
}

/**
 * Inject delay statements into the AST: both at the module top level
 * (using top-level await) and inside async function bodies.
 * Mutates the AST in place.
 *
 * @param {Object} ast - ESTree AST (Program node)
 * @param {Object} options - { filePath, mode, seed, delayConfig, skipTryCatch, skipGenerators }
 * @returns {import('../adapter-interface.js').InjectionPoint[]}
 */
export function injectDelays(ast, options) {
  const allPoints = [];

  // Inject at module top level (top-level await)
  const topLevelPoints = processTopLevel(ast, options);
  allPoints.push(...topLevelPoints);

  // Inject inside async function bodies
  simple(ast, {
    FunctionDeclaration(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      const points = processBody(node, getFnName(node), options);
      allPoints.push(...points);
    },
    FunctionExpression(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      const points = processBody(node, getFnName(node), options);
      allPoints.push(...points);
    },
    ArrowFunctionExpression(node) {
      if (!node.async) return;
      if (node.body.type !== 'BlockStatement') return;
      const points = processBody(node, '<arrow>', options);
      allPoints.push(...points);
    },
  });

  return allPoints;
}

/**
 * Add the runtime import as the first statement in the program body.
 * @param {Object} ast
 * @param {string} runtimeImportPath - relative path to runtime, e.g. './flake-monster.runtime.js' or '../flake-monster.runtime.js'
 */
export function addRuntimeImport(ast, runtimeImportPath = './flake-monster.runtime.js') {
  // Check if it's already there
  for (const node of ast.body) {
    if (
      node.type === 'ImportDeclaration' &&
      node.source.value.includes('flake-monster.runtime')
    ) {
      return;
    }
  }

  const importNode = {
    type: 'ImportDeclaration',
    specifiers: [
      {
        type: 'ImportSpecifier',
        imported: { type: 'Identifier', name: DELAY_OBJECT },
        local: { type: 'Identifier', name: DELAY_OBJECT },
      },
    ],
    source: { type: 'Literal', value: runtimeImportPath },
  };

  // Insert after any existing imports, or at the very top
  let insertIndex = 0;
  for (let i = 0; i < ast.body.length; i++) {
    if (ast.body[i].type === 'ImportDeclaration') {
      insertIndex = i + 1;
    } else {
      break;
    }
  }

  ast.body.splice(insertIndex, 0, importNode);
}

// ── Text-based injection (preserves original formatting) ──

/**
 * Extract the whitespace indentation before a given character offset.
 * Scans backward to the preceding newline.
 * @param {string} source
 * @param {number} offset
 * @returns {string}
 */
function getIndent(source, offset) {
  let lineStart = offset;
  while (lineStart > 0 && source[lineStart - 1] !== '\n') {
    lineStart--;
  }
  return source.slice(lineStart, offset);
}

/**
 * Collect text insertion descriptors for an array of statements.
 * Same selection logic as processStatements, but produces text offsets
 * instead of AST mutations.
 * @param {Object[]} bodyArray
 * @param {string} fnName
 * @param {string} source - original source text
 * @param {Object} options
 * @returns {{ insertions: { offset: number, text: string }[], points: Object[] }}
 */
function collectInsertionsForStatements(bodyArray, fnName, source, options) {
  const insertions = [];
  const points = [];
  let injectionIndex = 0;

  for (let i = 0; i < bodyArray.length; i++) {
    const stmt = bodyArray[i];

    if (shouldInject(options.mode, stmt, i)) {
      const delayMs = computeDelayMs(
        options.seed,
        options.filePath,
        fnName,
        injectionIndex,
        options.delayConfig,
      );

      const indent = getIndent(source, stmt.start);
      const text = `/* ${MARKER_PREFIX} */\n${indent}await ${DELAY_OBJECT}(${delayMs});\n${indent}`;

      insertions.push({ offset: stmt.start, text });

      points.push({
        fnName,
        index: injectionIndex,
        delayMs,
        line: stmt.loc?.start.line ?? 0,
        column: stmt.loc?.start.column ?? 0,
      });

      injectionIndex++;
    }
  }

  return { insertions, points };
}

/**
 * Compute text insertions for the entire AST without mutating it.
 * Walks the AST to find injection targets (same logic as injectDelays)
 * and returns insertion descriptors + metadata points.
 *
 * @param {Object} ast - ESTree AST (Program node), not mutated
 * @param {string} source - original source text
 * @param {Object} options - { filePath, mode, seed, delayConfig, skipTryCatch, skipGenerators }
 * @returns {{ insertions: { offset: number, text: string }[], points: Object[] }}
 */
export function computeInjections(ast, source, options) {
  const allInsertions = [];
  const allPoints = [];

  // Top-level statements (skip imports)
  let firstNonImport = 0;
  for (let i = 0; i < ast.body.length; i++) {
    if (ast.body[i].type === 'ImportDeclaration') {
      firstNonImport = i + 1;
    } else {
      break;
    }
  }
  const topStmts = ast.body.slice(firstNonImport);
  if (topStmts.length > 0) {
    const { insertions, points } = collectInsertionsForStatements(topStmts, '<top-level>', source, options);
    allInsertions.push(...insertions);
    allPoints.push(...points);
  }

  // Async function bodies
  simple(ast, {
    FunctionDeclaration(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      const { insertions, points } = collectInsertionsForStatements(node.body.body, getFnName(node), source, options);
      allInsertions.push(...insertions);
      allPoints.push(...points);
    },
    FunctionExpression(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      const { insertions, points } = collectInsertionsForStatements(node.body.body, getFnName(node), source, options);
      allInsertions.push(...insertions);
      allPoints.push(...points);
    },
    ArrowFunctionExpression(node) {
      if (!node.async) return;
      if (node.body.type !== 'BlockStatement') return;
      const { insertions, points } = collectInsertionsForStatements(node.body.body, '<arrow>', source, options);
      allInsertions.push(...insertions);
      allPoints.push(...points);
    },
  });

  return { insertions: allInsertions, points: allPoints };
}

/**
 * Compute a text insertion for the runtime import line.
 * Places it after the last ImportDeclaration in the AST.
 *
 * @param {Object} ast - ESTree AST (Program node), not mutated
 * @param {string} source - original source text
 * @param {string} runtimeImportPath
 * @returns {{ offset: number, text: string } | null}
 */
export function computeRuntimeImportInsertion(ast, source, runtimeImportPath) {
  // Don't duplicate
  for (const node of ast.body) {
    if (
      node.type === 'ImportDeclaration' &&
      node.source.value.includes('flake-monster.runtime')
    ) {
      return null;
    }
  }

  let lastImportEnd = 0;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      lastImportEnd = node.end;
    } else {
      break;
    }
  }

  // Find the newline after the last import (or start of file)
  let insertOffset = lastImportEnd;
  while (insertOffset < source.length && source[insertOffset] !== '\n') {
    insertOffset++;
  }
  if (insertOffset < source.length) {
    insertOffset++; // past the \n
  }

  const text = `import { ${DELAY_OBJECT} } from '${runtimeImportPath}';\n`;
  return { offset: insertOffset, text };
}

/**
 * Apply text insertions to a source string.
 * Insertions are applied back-to-front so earlier offsets stay valid.
 *
 * @param {string} source
 * @param {{ offset: number, text: string }[]} insertions
 * @returns {string}
 */
export function applyInsertions(source, insertions) {
  const sorted = [...insertions].sort((a, b) => b.offset - a.offset);
  let result = source;
  for (const { offset, text } of sorted) {
    result = result.slice(0, offset) + text + result.slice(offset);
  }
  return result;
}

export { MARKER_PREFIX, DELAY_OBJECT };
