/**
 * A utility class with a leading JSDoc block comment
 * and no imports at the top of the file.
 */
export class CssFlattener {
  static flatten(el) {
    return el.style.cssText;
  }

  static async resolve(el) {
    const style = await computeStyle(el);
    return style;
  }
}
