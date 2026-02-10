/**
 * Minimal regex-based JavaScript syntax highlighter.
 * Zero external dependencies.
 */

const PATTERNS = [
  [/\/\/[^\n]*/, 'syn-cmt'],
  [/\/\*[\s\S]*?\*\//, 'syn-cmt'],
  [/"(?:[^"\\]|\\.)*"/, 'syn-str'],
  [/'(?:[^'\\]|\\.)*'/, 'syn-str'],
  [/`(?:[^`\\]|\\.)*`/, 'syn-str'],
  [/\b(async|await|function|const|let|var|return|throw|if|else|for|while|do|import|export|from|default|class|new|try|catch|finally|typeof|instanceof|in|of|yield|break|continue|switch|case|static|extends|super)\b/, 'syn-kw'],
  [/\b\d+(?:\.\d+)?\b/, 'syn-num'],
  [/[{}()\[\];,.:?]|=>/, 'syn-pun'],
  [/[=+\-*/%!<>&|^~]+/, 'syn-op'],
  [/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/, 'syn-id'],
];

// Build a combined regex with named-ish groups via alternation order
const COMBINED = new RegExp(
  PATTERNS.map(([re], i) => `(${re.source})`).join('|'),
  'g',
);

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tokenize source and return an array of { text, cls } spans.
 * Unmatched characters get cls = null.
 */
function tokenize(source) {
  const tokens = [];
  let lastIndex = 0;

  for (const match of source.matchAll(COMBINED)) {
    // Gap before this match
    if (match.index > lastIndex) {
      tokens.push({ text: source.slice(lastIndex, match.index), cls: null });
    }

    // Figure out which capture group matched
    let cls = null;
    for (let i = 0; i < PATTERNS.length; i++) {
      if (match[i + 1] !== undefined) {
        cls = PATTERNS[i][1];
        break;
      }
    }

    tokens.push({ text: match[0], cls });
    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < source.length) {
    tokens.push({ text: source.slice(lastIndex), cls: null });
  }

  return tokens;
}

/**
 * Highlight source and return an array of per-line HTML strings (no wrapping divs).
 */
export function highlightToLines(source) {
  const tokens = tokenize(source);
  let html = '';
  for (const { text, cls } of tokens) {
    const escaped = escapeHtml(text);
    html += cls ? `<span class="${cls}">${escaped}</span>` : escaped;
  }
  return html.split('\n');
}

/**
 * Highlight JavaScript source code and return an HTML string.
 * Each line is wrapped in a <div class="code-line" data-line="N">.
 */
export function highlight(source, options = {}) {
  const { highlightLines } = options;
  const tokens = tokenize(source);

  // Flatten tokens into a single HTML string, then split by newlines
  let html = '';
  for (const { text, cls } of tokens) {
    const escaped = escapeHtml(text);
    if (cls) {
      html += `<span class="${cls}">${escaped}</span>`;
    } else {
      html += escaped;
    }
  }

  // Split by newline into lines and wrap each
  const lines = html.split('\n');
  return lines
    .map((lineHtml, i) => {
      const lineNum = i + 1;
      const injected = highlightLines?.has(lineNum) ? ' line-injected' : '';
      return `<div class="code-line${injected}" data-line="${lineNum}">${lineHtml}</div>`;
    })
    .join('\n');
}
