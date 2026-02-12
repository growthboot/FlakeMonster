import { DELAY_OBJECT } from './injector.js';

/**
 * Stamp fragment used for line matching.
 * This substring is unique enough that any line containing it
 * is almost certainly injected by FlakeMonster.
 */
const RECOVERY_STAMP = 'jt92-se2j!';

/**
 * Classify why a line matches recovery patterns.
 * @param {string} trimmed
 * @returns {string|null} reason string, or null if no match
 */
function classifyRecoveryMatch(trimmed) {
  if (trimmed.includes(RECOVERY_STAMP)) return 'stamp';
  // Match the delay call pattern: await __FlakeMonster__ (
  // Allows whitespace between tokens (linter reformatting) but requires
  // __FlakeMonster__ as the callee so we don't false-positive on test code
  // that merely references the identifier in strings or assertions.
  if (new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\(`).test(trimmed)) return 'identifier';
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
