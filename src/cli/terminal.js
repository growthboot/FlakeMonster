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

// ── Spinner ───────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
const SPINNER_INTERVAL = 80; // ms

/**
 * A simple terminal spinner with elapsed time display.
 * On non-TTY terminals, prints a single static line instead.
 */
export class Spinner {
  /**
   * @param {string} message - Text to show next to the spinner
   */
  constructor(message) {
    this.message = message;
    this._timer = null;
    this._frame = 0;
    this._startTime = null;
  }

  /** Start the spinner animation. */
  start() {
    this._startTime = Date.now();

    if (!isTTY()) {
      process.stdout.write(`  ${this.message} ...\n`);
      return;
    }

    this._render();
    this._timer = setInterval(() => this._render(), SPINNER_INTERVAL);
  }

  /** Stop the spinner and clear the line. Returns elapsed ms. */
  stop() {
    const elapsed = this._startTime ? Date.now() - this._startTime : 0;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    if (isTTY()) {
      // Clear the spinner line
      process.stdout.write('\r\x1b[K');
    }

    return elapsed;
  }

  /** @private */
  _render() {
    const frame = SPINNER_FRAMES[this._frame % SPINNER_FRAMES.length];
    this._frame++;
    const elapsed = ((Date.now() - this._startTime) / 1000).toFixed(1);
    const elapsedStr = dim(`(${elapsed}s)`);
    process.stdout.write(`\r  ${frame} ${this.message} ${elapsedStr}\x1b[K`);
  }
}
