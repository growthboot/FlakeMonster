import { generate } from 'astring';

/**
 * Generate source code from an ESTree AST.
 * Preserves comments that were attached by astravel.
 * @param {Object} ast
 * @returns {string}
 */
export function generateSource(ast) {
  return generate(ast, {
    comments: true,
  });
}
