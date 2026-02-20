/**
 * Terminal utilities for rich CLI output.
 * Zero dependencies — raw ANSI escape codes + process.stdout.
 */

// ── Color support detection ───────────────────────────────────────────

let _colorEnabled = null;

/**
 * Check whether the terminal supports ANSI color codes.
 * Respects NO_COLOR (https://no-color.org/) and FORCE_COLOR env vars.
 */
export function supportsColor() {
  if (_colorEnabled !== null) return _colorEnabled;
  if (process.env.NO_COLOR !== undefined) {
    _colorEnabled = false;
  } else if (process.env.FORCE_COLOR !== undefined) {
    _colorEnabled = true;
  } else {
    _colorEnabled = process.stdout.isTTY === true;
  }
  return _colorEnabled;
}

/** Reset the memoized color detection (for testing). */
export function resetColorCache() {
  _colorEnabled = null;
}

/** Whether stdout is an interactive terminal. */
export function isTTY() {
  return process.stdout.isTTY === true;
}

// ── ANSI wrappers ─────────────────────────────────────────────────────

function wrap(open, close) {
  return (s) => supportsColor() ? `\x1b[${open}m${s}\x1b[${close}m` : s;
}

export const bold = wrap('1', '22');
export const dim = wrap('2', '22');
export const red = wrap('31', '39');
export const green = wrap('32', '39');
export const yellow = wrap('33', '39');
export const cyan = wrap('36', '39');

/**
 * Strip ANSI escape codes from a string.
 * @param {string} s
 * @returns {string}
 */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[\d+m/g, '');
}

// ── Progress bar ──────────────────────────────────────────────────────

const BLOCK_FILLED = '\u2588'; // █
const BLOCK_EMPTY = '\u2591';  // ░

/**
 * Render a text progress bar.
 * @param {number} current
 * @param {number} total
 * @param {number} [width=20]
 * @returns {string}  e.g. "██████░░░░░░░░░░░░░░ 3/10"
 */
export function progressBar(current, total, width = 20) {
  const filled = total > 0 ? Math.round((current / total) * width) : 0;
  const empty = width - filled;
  return BLOCK_FILLED.repeat(filled) + BLOCK_EMPTY.repeat(empty) + ` ${current}/${total}`;
}

// ── Box drawing ───────────────────────────────────────────────────────

/**
 * Wrap lines in a Unicode box.
 * @param {string[]} lines
 * @returns {string}
 */
export function box(lines) {
  const stripped = lines.map(stripAnsi);
  const maxLen = Math.max(...stripped.map(l => l.length));
  const pad = (line, strippedLine) => {
    const diff = maxLen - strippedLine.length;
    return line + ' '.repeat(diff);
  };

  const top = '  \u250c\u2500' + '\u2500'.repeat(maxLen) + '\u2500\u2510';
  const bottom = '  \u2514\u2500' + '\u2500'.repeat(maxLen) + '\u2500\u2518';
  const body = lines.map((line, i) => `  \u2502 ${pad(line, stripped[i])} \u2502`);

  return [top, ...body, bottom].join('\n');
}

// ── Sticky line ───────────────────────────────────────────────────────

/**
 * A persistent status line that stays at the bottom of the terminal
 * while other output scrolls above it.
 *
 * On non-TTY terminals, does nothing — output flows normally.
 */
export class StickyLine {
  constructor() {
    this._content = '';
    this._active = false;
  }

  /**
   * Start showing the sticky line.
   * @param {string} content - Initial content
   */
  start(content) {
    this._active = true;
    this._content = content;
    if (isTTY()) {
      process.stdout.write(this._content);
    }
  }

  /**
   * Update the sticky line content (e.g. elapsed timer).
   * @param {string} content
   */
  update(content) {
    this._content = content;
    if (this._active && isTTY()) {
      process.stdout.write('\r\x1b[K' + this._content);
    }
  }

  /**
   * Write output above the sticky line.
   * Clears the sticky, writes the chunk, then re-renders.
   * @param {Buffer|string} chunk
   */
  writeAbove(chunk) {
    if (!this._active || !isTTY()) {
      process.stdout.write(chunk);
      return;
    }
    // Clear sticky line
    process.stdout.write('\r\x1b[K');
    // Write the actual output
    process.stdout.write(chunk);
    // Ensure sticky gets its own line
    const str = chunk.toString();
    if (str.length > 0 && !str.endsWith('\n')) {
      process.stdout.write('\n');
    }
    // Re-render sticky
    process.stdout.write(this._content);
  }

  /**
   * Write stderr output above the sticky line.
   * @param {Buffer|string} chunk
   */
  writeAboveStderr(chunk) {
    if (!this._active || !isTTY()) {
      process.stderr.write(chunk);
      return;
    }
    // Clear sticky on stdout, write stderr, re-render sticky
    process.stdout.write('\r\x1b[K');
    process.stderr.write(chunk);
    const str = chunk.toString();
    if (str.length > 0 && !str.endsWith('\n')) {
      process.stderr.write('\n');
    }
    process.stdout.write(this._content);
  }

  /** Clear the sticky line and deactivate. */
  clear() {
    if (this._active && isTTY()) {
      process.stdout.write('\r\x1b[K');
    }
    this._active = false;
    this._content = '';
  }
}
