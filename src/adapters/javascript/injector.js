import { simple } from 'acorn-walk';
import { randomBytes } from 'node:crypto';

const MARKER_PREFIX = '@flake-monster[jt92-se2j!] v1';
const DELAY_OBJECT = '__FlakeMonster__';

/**
 * Generate a short unique ID for an injection point.
 * @returns {string}
 */
function generateId() {
  return randomBytes(4).toString('hex');
}

/**
 * Build an AST node for a block comment: /*flake-monster:delay v1 ...* /
 * @param {number} seed
 * @param {string} mode
 * @param {string} id
 * @returns {Object}
 */
function createMarkerComment(seed, mode, id) {
  return {
    type: 'Block',
    value: `${MARKER_PREFIX} id=${id} seed=${seed} mode=${mode}`,
  };
}

/**
 * Build the AST for: await __FlakeMonster__.delay({ seed, file, fn, n })
 * Returns an ExpressionStatement node.
 * @param {Object} options
 * @param {string} fnName
 * @param {number} index
 * @param {Object} comment - the marker comment to attach
 * @returns {Object}
 */
function createDelayStatement(options, fnName, index, comment) {
  return {
    type: 'ExpressionStatement',
    expression: {
      type: 'AwaitExpression',
      argument: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: DELAY_OBJECT },
          property: { type: 'Identifier', name: 'delay' },
          computed: false,
        },
        arguments: [
          {
            type: 'ObjectExpression',
            properties: [
              { type: 'Property', key: { type: 'Identifier', name: 'seed' }, value: { type: 'Literal', value: options.seed }, kind: 'init', computed: false, method: false, shorthand: false },
              { type: 'Property', key: { type: 'Identifier', name: 'file' }, value: { type: 'Literal', value: options.filePath }, kind: 'init', computed: false, method: false, shorthand: false },
              { type: 'Property', key: { type: 'Identifier', name: 'fn' }, value: { type: 'Literal', value: fnName }, kind: 'init', computed: false, method: false, shorthand: false },
              { type: 'Property', key: { type: 'Identifier', name: 'n' }, value: { type: 'Literal', value: index }, kind: 'init', computed: false, method: false, shorthand: false },
            ],
          },
        ],
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
 * Check if a statement is inside a try/catch/finally block.
 * We track this via the parent context from our walk.
 * @param {Object} node
 * @returns {boolean}
 */
function isInTryCatchBlock(ancestors) {
  return ancestors.some((a) => a.type === 'TryStatement');
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
 * Process a single async function body: splice delay statements into its body array.
 * @param {Object} fnNode
 * @param {string} fnName
 * @param {Object} options - inject options
 * @param {Object[]} points - accumulator for injection points
 */
function processBody(fnNode, fnName, options) {
  const body = fnNode.body.body;
  const points = [];
  const newBody = [];
  let injectionIndex = 0;

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];

    if (shouldInject(options.mode, stmt, i)) {
      const id = generateId();
      const comment = createMarkerComment(options.seed, options.mode, id);
      const delayStmt = createDelayStatement(options, fnName, injectionIndex, comment);

      newBody.push(delayStmt);

      points.push({
        id,
        fnName,
        index: injectionIndex,
        line: stmt.loc?.start.line ?? 0,
        column: stmt.loc?.start.column ?? 0,
      });

      injectionIndex++;
    }

    newBody.push(stmt);
  }

  fnNode.body.body = newBody;
  return points;
}

/**
 * Inject delay statements into all async function bodies in the AST.
 * Mutates the AST in place.
 *
 * @param {Object} ast - ESTree AST (Program node)
 * @param {Object} options - { filePath, mode, seed, delayConfig, skipTryCatch, skipGenerators }
 * @returns {import('../adapter-interface.js').InjectionPoint[]}
 */
export function injectDelays(ast, options) {
  const allPoints = [];

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

export { MARKER_PREFIX, DELAY_OBJECT };
