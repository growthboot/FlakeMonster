/**
 * Browser-compatible FlakeMonster adapter.
 * Inlines the adapter pipeline (parser, injector, codegen, remover)
 * with node:crypto replaced by Web Crypto API.
 *
 * Bare specifiers (acorn, acorn-walk, astravel, astring) are resolved
 * via the import map defined in index.html.
 */

import * as acorn from 'acorn';
import { simple } from 'acorn-walk';
import { attachComments } from 'astravel';
import { generate } from 'astring';

// ── Constants ──

export const MARKER_PREFIX = '@flake-monster[jt92-se2j!] v1';
export const DELAY_OBJECT = '__FlakeMonster__';
const RECOVERY_STAMP = 'jt92-se2j!';
const RUNTIME_FILENAME = 'flake-monster.runtime.js';

// ── ID generation (replaces node:crypto randomBytes) ──

function generateId() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Parser (from parser.js) ──

function parseSource(source) {
  const comments = [];
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    onComment: comments,
  });
  attachComments(ast, comments);
  return { ast, comments };
}

// ── Codegen (from codegen.js) ──

function generateSource(ast) {
  let code = generate(ast, { comments: true });
  // Compact multi-line delay calls into a single line:
  //   await __FlakeMonster__.delay({\n  seed: ...,\n  ...\n})  →  one line
  code = code.replace(
    /await __FlakeMonster__\.delay\(\{[\s\S]*?\}\)/g,
    (m) => m.replace(/\n\s*/g, ' '),
  );
  return code;
}

// ── Injector (from injector.js) ──

function createMarkerComment(seed, mode, id) {
  return {
    type: 'Block',
    value: `${MARKER_PREFIX} id=${id} seed=${seed} mode=${mode}`,
  };
}

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

function shouldInject(mode, stmt, index) {
  if (mode === 'light') return index === 0;
  if (mode === 'medium') return stmt.type !== 'ReturnStatement' && stmt.type !== 'ThrowStatement';
  if (mode === 'hardcore') return true;
  return false;
}

function getFnName(node) {
  if (node.id && node.id.name) return node.id.name;
  return '<anonymous>';
}

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

function injectDelays(ast, options) {
  const allPoints = [];

  simple(ast, {
    FunctionDeclaration(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      allPoints.push(...processBody(node, getFnName(node), options));
    },
    FunctionExpression(node) {
      if (!node.async) return;
      if (options.skipGenerators && node.generator) return;
      allPoints.push(...processBody(node, getFnName(node), options));
    },
    ArrowFunctionExpression(node) {
      if (!node.async) return;
      if (node.body.type !== 'BlockStatement') return;
      allPoints.push(...processBody(node, '<arrow>', options));
    },
  });

  return allPoints;
}

function addRuntimeImport(ast, runtimeImportPath = './flake-monster.runtime.js') {
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && node.source.value.includes('flake-monster.runtime')) {
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

// ── Remover (from remover.js) ──

function classifyRecoveryMatch(trimmed) {
  if (trimmed.includes(RECOVERY_STAMP)) return 'stamp';
  if (new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\.\\s*delay\\s*\\(`).test(trimmed)) return 'identifier';
  if (/import\s.*flake-monster\.runtime/.test(trimmed)) return 'runtime-import';
  return null;
}

function netBraceDepth(line) {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
  }
  return depth;
}

function collectRecoveryIndices(lines) {
  const hits = [];
  let depth = 0;
  let spanning = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (spanning) {
      hits.push({ index: i, reason: 'identifier' });
      depth += netBraceDepth(trimmed);
      if (depth <= 0) {
        spanning = false;
        depth = 0;
      }
      continue;
    }
    const reason = classifyRecoveryMatch(trimmed);
    if (reason) {
      hits.push({ index: i, reason });
      if (reason === 'identifier') {
        const net = netBraceDepth(trimmed);
        if (net > 0) {
          spanning = true;
          depth = net;
        }
      }
    }
  }

  return hits;
}

function recoverDelays(source) {
  const lines = source.split('\n');
  const hits = collectRecoveryIndices(lines);
  const removeSet = new Set(hits.map((h) => h.index));
  const filtered = lines.filter((_, i) => !removeSet.has(i));
  return {
    source: filtered.join('\n'),
    recoveredCount: removeSet.size,
  };
}

// ── Runtime import path (from index.js) ──

function computeRuntimeImportPath(filePath) {
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length <= 1) return `./${RUNTIME_FILENAME}`;
  const ups = '../'.repeat(parts.length - 1);
  return `${ups}${RUNTIME_FILENAME}`;
}

// ── Public API ──

export function createBrowserAdapter() {
  return {
    inject(source, options) {
      const { ast } = parseSource(source);
      const points = injectDelays(ast, options);
      const runtimeNeeded = points.length > 0;
      if (runtimeNeeded) {
        const importPath = computeRuntimeImportPath(options.filePath);
        addRuntimeImport(ast, importPath);
      }
      const output = generateSource(ast);
      return { source: output, points, runtimeNeeded };
    },

    remove(source) {
      const { source: cleaned, recoveredCount } = recoverDelays(source);
      return { source: cleaned, removedCount: recoveredCount };
    },
  };
}
