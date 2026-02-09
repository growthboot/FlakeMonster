import { simple, full } from 'acorn-walk';
import { MARKER_PREFIX, DELAY_OBJECT } from './injector.js';

/**
 * Stamp fragment used for recovery-mode line matching.
 * This substring is unique enough that any line containing it
 * is almost certainly injected by FlakeMonster.
 */
const RECOVERY_STAMP = 'jt92-se2j!';

/**
 * Check if a statement is a flake-monster delay injection.
 * Matches: ExpressionStatement > AwaitExpression > CallExpression(__FlakeMonster__.delay)
 * with the call having object properties { seed, file, fn, n }.
 * @param {Object} stmt
 * @returns {boolean}
 */
function isFlakeDelayStatement(stmt) {
  if (stmt.type !== 'ExpressionStatement') return false;

  const expr = stmt.expression;
  if (expr.type !== 'AwaitExpression') return false;

  const arg = expr.argument;
  if (!arg || arg.type !== 'CallExpression') return false;

  const callee = arg.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (callee.object.type !== 'Identifier' || callee.object.name !== DELAY_OBJECT) return false;
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'delay') return false;

  // Verify the argument is an object with our known property names
  if (arg.arguments.length !== 1) return false;
  const objArg = arg.arguments[0];
  if (objArg.type !== 'ObjectExpression') return false;
  const propNames = new Set(objArg.properties.map((p) => p.key?.name));
  if (!propNames.has('seed') || !propNames.has('file') || !propNames.has('fn') || !propNames.has('n')) return false;

  return true;
}

/**
 * Check if a comment is a flake-monster marker comment.
 * @param {Object} comment
 * @returns {boolean}
 */
function isMarkerComment(comment) {
  return comment.type === 'Block' && comment.value.includes(MARKER_PREFIX);
}

/**
 * Check if an import is the flake-monster runtime import.
 * @param {Object} node
 * @returns {boolean}
 */
function isFlakeRuntimeImport(node) {
  if (node.type !== 'ImportDeclaration') return false;
  return node.source.value.includes('flake-monster.runtime');
}

/**
 * Strip marker comments from a node's comments/trailingComments arrays.
 * @param {Object} node
 */
function stripMarkerComments(node) {
  if (Array.isArray(node.comments)) {
    node.comments = node.comments.filter((c) => !isMarkerComment(c));
    if (node.comments.length === 0) delete node.comments;
  }
  if (Array.isArray(node.trailingComments)) {
    node.trailingComments = node.trailingComments.filter((c) => !isMarkerComment(c));
    if (node.trailingComments.length === 0) delete node.trailingComments;
  }
}

/**
 * Remove all flake-monster injections from the AST.
 * 1. Removes delay ExpressionStatements from block bodies
 * 2. Strips orphaned marker comments from all remaining nodes
 * Mutates the AST in place.
 *
 * @param {Object} ast
 * @returns {number} count of removed delay injections
 */
export function removeDelays(ast) {
  let removedCount = 0;

  // Remove delay statements from all block bodies
  simple(ast, {
    BlockStatement(node) {
      node.body = node.body.filter((stmt) => {
        if (isFlakeDelayStatement(stmt)) {
          removedCount++;
          return false;
        }
        return true;
      });
    },
  });

  // Clean up any orphaned marker comments on remaining nodes
  full(ast, (node) => {
    stripMarkerComments(node);
  });

  return removedCount;
}

/**
 * Remove the flake-monster runtime import from program body.
 * @param {Object} ast
 * @returns {boolean} whether an import was removed
 */
export function removeRuntimeImport(ast) {
  const before = ast.body.length;
  ast.body = ast.body.filter((node) => !isFlakeRuntimeImport(node));
  return ast.body.length < before;
}

/**
 * Classify why a line matches recovery patterns.
 * @param {string} trimmed
 * @returns {string|null} reason string, or null if no match
 */
function classifyRecoveryMatch(trimmed) {
  if (trimmed.includes(RECOVERY_STAMP)) return 'stamp';
  // Match the actual delay call pattern: await __FlakeMonster__ . delay (
  // Allows whitespace between tokens (linter reformatting) but requires
  // the .delay( shape so we don't false-positive on test code that merely
  // references the identifier in strings or assertions.
  if (new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\.\\s*delay\\s*\\(`).test(trimmed)) return 'identifier';
  if (/import\s.*flake-monster\.runtime/.test(trimmed)) return 'runtime-import';
  return null;
}

/**
 * Count unmatched opening braces on a line (braces opened minus braces closed).
 * @param {string} line
 * @returns {number}
 */
function netBraceDepth(line) {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{' || ch === '(') depth++;
    else if (ch === '}' || ch === ')') depth--;
  }
  return depth;
}

/**
 * Walk lines and collect indices that should be removed by recovery.
 * Handles multi-line spans: when an identifier match opens a brace block
 * (e.g. `await __FlakeMonster__.delay({`), continuation lines through
 * the matching close are also marked for removal.
 *
 * @param {string[]} lines
 * @returns {{ index: number, reason: string }[]}
 */
function collectRecoveryIndices(lines) {
  const hits = [];
  let depth = 0;
  let spanning = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // If we're inside a multi-line span, consume until braces close
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
      // Check if this identifier line opens a multi-line call
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

/**
 * Scan source for lines that recovery mode would remove.
 * Returns match metadata without modifying the source.
 *
 * @param {string} source
 * @returns {{ line: number, content: string, reason: string }[]}
 */
export function scanForRecovery(source) {
  const lines = source.split('\n');
  return collectRecoveryIndices(lines).map(({ index, reason }) => ({
    line: index + 1,
    content: lines[index],
    reason,
  }));
}

/**
 * Recovery mode: text-based removal for when AST matching fails.
 * Uses loose pattern matching to find and remove injected lines
 * even if an AI or manual edit has mangled the AST structure.
 *
 * Targets lines containing:
 *   - The recovery stamp (jt92-se2j!)
 *   - The __FlakeMonster__ identifier in an await-like context
 *   - Import of flake-monster.runtime
 *
 * Also removes continuation lines when a matched line opens a
 * multi-line block (e.g. linter-reformatted delay calls).
 *
 * @param {string} source
 * @returns {{ source: string, recoveredCount: number }}
 */
export function recoverDelays(source) {
  const lines = source.split('\n');
  const hits = collectRecoveryIndices(lines);
  const removeSet = new Set(hits.map((h) => h.index));

  const filtered = lines.filter((_, i) => !removeSet.has(i));

  return {
    source: filtered.join('\n'),
    recoveredCount: removeSet.size,
  };
}
