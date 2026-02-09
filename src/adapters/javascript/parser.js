import * as acorn from 'acorn';
import { attachComments } from 'astravel';

/**
 * Parse JS source to ESTree AST with comments attached to nodes.
 * @param {string} source
 * @returns {{ ast: Object, comments: Object[] }}
 */
export function parseSource(source) {
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
