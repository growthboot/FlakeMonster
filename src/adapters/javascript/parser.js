import * as acorn from 'acorn';
import { defaultTraveler, attachComments } from 'astravel';

// Patch astravel bug: PropertyDefinition reuses MethodDefinition handler which
// calls this.go(node.value) without a null guard. Uninitialized class fields
// (e.g. `bar;`) have value: null, crashing the traversal.
defaultTraveler.PropertyDefinition = function (node, state) {
  this.go(node.key, state);
  if (node.value != null) {
    this.go(node.value, state);
  }
};

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
