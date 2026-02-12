/**
 * FlakeMonster interactive demos.
 * Imports the real CLI adapter modules directly, no browser-specific copy.
 */

import { parseSource } from '../src/adapters/javascript/parser.js';
import { injectDelays, addRuntimeImport, computeInjections, computeRuntimeImportInsertion, applyInsertions, MARKER_PREFIX, DELAY_OBJECT } from '../src/adapters/javascript/injector.js';
import { recoverDelays } from '../src/adapters/javascript/remover.js';
import { deriveSeed, createRng } from '../src/core/seed.js';
import { highlightToLines } from './syntax.js';

// ── Adapter: thin wrapper over the real CLI modules ──

const adapter = {
  inject(source, options) {
    const { ast } = parseSource(source);
    const { insertions, points } = computeInjections(ast, source, options);
    if (points.length > 0) {
      const imp = computeRuntimeImportInsertion(ast, source, './flake-monster.runtime.js');
      if (imp) insertions.push(imp);
    }
    return { source: applyInsertions(source, insertions), points, runtimeNeeded: points.length > 0 };
  },
  remove(source) {
    const { source: cleaned, recoveredCount } = recoverDelays(source);
    return { source: cleaned, removedCount: recoveredCount };
  },
};

// ── Delay computation (uses the real seed module) ──

function computeDelay(seed, file, fn, n, minMs = 0, maxMs = 50) {
  const context = `${file}:${fn}:${n}`;
  const contextSeed = deriveSeed(seed, context);
  const rng = createRng(contextSeed);
  return minMs + rng() * (maxMs - minMs);
}

// ── Sample code for Code Before/After demo ──

const SAMPLE_CODE = `import { fetchData } from './api.js';

const config = await fetchData('/config');

async function loadUser(id) {
  const user = await fetchData(\`/users/\${id}\`);
  const profile = await fetchData(\`/profiles/\${id}\`);
  return { user, profile };
}

async function saveUser(user) {
  const result = await fetchData('/users', {
    method: 'POST',
    body: user,
  });
  console.log('saved');
  return result;
}

export { loadUser, saveUser };`;

// ══════════════════════════════════════════════
// DEMO 0: How It Works (Pipeline)
// ══════════════════════════════════════════════

const PIPELINE_CODE = `import { fetchData } from './api.js';

const config = await fetchData('/config');

async function loadUser(id) {
  const user = await fetchData(id);
  const profile = await fetchData(id);
  return { user, profile };
}`;

const STEP_CAPTIONS = [
  'Your JavaScript source code.',
  '<b>Acorn</b> parses it into an Abstract Syntax Tree (AST).',
  'Finds async functions and top-level module statements.',
  'FlakeMonster inserts delay statements at the module level and inside async function bodies.',
  'astring generates the modified source code from the AST.',
  '<b>Restore</b> removes every injected line ,  marker comments, <code>await</code> delays, and the runtime import ,  returning your original source.',
];

/**
 * Build a simplified tree model from a real Acorn AST node.
 * Returns { type, detail, async, children, injected } objects.
 */
function simplifyAst(node) {
  if (!node || typeof node !== 'object') return null;

  const result = { type: node.type, detail: '', async: false, injected: false, topLevelTarget: false, children: [] };

  switch (node.type) {
    case 'Program':
      result.children = node.body.map(simplifyAst).filter(Boolean);
      // Mark non-import top-level statements as injection targets
      for (const child of result.children) {
        if (child.type !== 'ImportDeclaration') {
          child.topLevelTarget = true;
        }
      }
      break;

    case 'FunctionDeclaration':
    case 'FunctionExpression': {
      const name = node.id?.name || '<anonymous>';
      result.async = !!node.async;
      result.detail = result.async ? `async ${name}(${paramsStr(node)})` : `${name}(${paramsStr(node)})`;
      if (node.body) result.children = [simplifyAst(node.body)].filter(Boolean);
      break;
    }

    case 'ArrowFunctionExpression':
      result.async = !!node.async;
      result.detail = result.async ? 'async () => { ... }' : '() => { ... }';
      if (node.body?.type === 'BlockStatement') result.children = [simplifyAst(node.body)].filter(Boolean);
      break;

    case 'BlockStatement':
      result.children = node.body.map(simplifyAst).filter(Boolean);
      break;

    case 'VariableDeclaration': {
      const decl = node.declarations?.[0];
      const name = decl?.id?.name || '...';
      result.detail = `${node.kind} ${name} = ...`;
      break;
    }

    case 'ReturnStatement':
      result.detail = 'return { ... }';
      break;

    case 'ExpressionStatement': {
      const expr = node.expression;
      if (expr?.type === 'AwaitExpression') {
        const arg = expr.argument;
        if (arg?.type === 'CallExpression' && arg.callee?.name === DELAY_OBJECT) {
          result.detail = `await ${DELAY_OBJECT}(${arg.arguments?.[0]?.value ?? '...'})`;
          result.injected = true;
        } else {
          result.detail = 'await ...';
        }
      } else if (expr?.type === 'CallExpression') {
        const callee = expr.callee;
        const name = callee?.property?.name || callee?.name || '...';
        result.detail = `${name}(...)`;
      } else {
        result.detail = '...';
      }
      break;
    }

    case 'ImportDeclaration': {
      const src = node.source?.value || '...';
      if (src.includes('flake-monster.runtime')) {
        result.detail = `{ ${DELAY_OBJECT} } from "${src}"`;
        result.injected = true;
      } else {
        const specs = node.specifiers?.map(s => s.local?.name).join(', ') || '...';
        result.detail = `{ ${specs} } from "${src}"`;
      }
      break;
    }

    case 'ExportNamedDeclaration':
      result.detail = '{ ... }';
      break;

    default:
      result.detail = '';
  }

  return result;
}

function paramsStr(node) {
  return (node.params || []).map(p => p.name || '...').join(', ');
}

/**
 * Render a tree model to HTML.
 * @param {Object} tree - simplified AST node
 * @param {number} step - current pipeline step (0-4)
 * @returns {string} HTML
 */
function renderTree(tree, step) {
  let labelClass = 'tree-label';
  let badges = '';

  // Step 2 (Walk): highlight async function nodes and top-level targets
  if (step >= 2 && tree.async) {
    labelClass += ' highlight';
    badges += '<span class="tree-badge async-badge">async</span>';
  }
  if (step >= 2 && tree.topLevelTarget && !tree.async) {
    labelClass += ' highlight';
    badges += '<span class="tree-badge async-badge">module</span>';
  }

  // Step 3+ (Inject): highlight injected nodes
  if (step >= 3 && tree.injected) {
    labelClass += ' injected';
    badges += '<span class="tree-badge new-badge">new</span>';
  }

  const detail = tree.detail ? `<span class="tree-detail">${escHtml(tree.detail)}</span>` : '';
  let html = `<div class="tree-node"><span class="${labelClass}"><span class="tree-type">${tree.type}</span>${detail}${badges}</span>`;

  if (tree.children.length > 0) {
    html += `<div class="tree-children">`;
    for (const child of tree.children) {
      html += renderTree(child, step);
    }
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCode(el, source) {
  const lines = highlightToLines(source);
  el.innerHTML = lines.map((lineHtml, i) => {
    const num = String(i + 1).padStart(2);
    return `<div class="code-line"><span class="line-num">${num}</span><span class="line-gutter"> </span>${lineHtml}</div>`;
  }).join('\n');
}

function renderCodeDiff(el, source) {
  const rawLines = source.split('\n');
  const highlighted = highlightToLines(source);
  el.innerHTML = highlighted.map((lineHtml, i) => {
    const num = String(i + 1).padStart(2);
    const trimmed = rawLines[i].trim();
    const isInjected = trimmed.includes(MARKER_PREFIX)
      || new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\(`).test(trimmed)
      || /import\s.*flake-monster\.runtime/.test(trimmed);
    const cls = isInjected ? 'code-line line-added' : 'code-line';
    const gutter = isInjected ? '+' : ' ';
    return `<div class="${cls}"><span class="line-num">${num}</span><span class="line-gutter">${gutter}</span>${lineHtml}</div>`;
  }).join('\n');
}

function initPipelineDemo() {
  const stepsEl = document.getElementById('pipeline-steps');
  const captionEl = document.getElementById('pipeline-caption');
  const displayEl = document.getElementById('pipeline-display');
  const stepButtons = stepsEl.querySelectorAll('.pipeline-step');

  // Pre-compute all views
  const pipelineOptions = {
    filePath: 'src/user.js',
    mode: 'medium',
    seed: 42,
    delayConfig: { minMs: 0, maxMs: 50 },
    skipTryCatch: false,
    skipGenerators: true,
  };

  const { ast: originalAst } = parseSource(PIPELINE_CODE);
  const originalTree = simplifyAst(originalAst);

  // Text-based injected source (preserves original formatting)
  const { insertions } = computeInjections(originalAst, PIPELINE_CODE, pipelineOptions);
  const runtimeIns = computeRuntimeImportInsertion(originalAst, PIPELINE_CODE, './flake-monster.runtime.js');
  if (runtimeIns) insertions.push(runtimeIns);
  const injectedSource = applyInsertions(PIPELINE_CODE, insertions);

  // AST-mutated version for tree visualization (steps 2-4)
  const { ast: injectedAst } = parseSource(PIPELINE_CODE);
  injectDelays(injectedAst, pipelineOptions);
  addRuntimeImport(injectedAst, './flake-monster.runtime.js');
  const injectedTree = simplifyAst(injectedAst);

  // Restored version (run remover on injected source)
  const { source: restoredSource } = recoverDelays(injectedSource);

  function showStep(step) {
    // Update step buttons
    stepButtons.forEach((btn) => {
      const s = parseInt(btn.dataset.step, 10);
      btn.classList.toggle('active', s === step);
      btn.classList.toggle('done', s < step);
    });

    captionEl.innerHTML = STEP_CAPTIONS[step];

    // Render the display
    switch (step) {
      case 0: // Source
        renderCode(displayEl, PIPELINE_CODE);
        break;
      case 1: // Parse
        displayEl.innerHTML = renderTree(originalTree, step);
        break;
      case 2: // Walk
        displayEl.innerHTML = renderTree(originalTree, step);
        break;
      case 3: // Inject
        displayEl.innerHTML = renderTree(injectedTree, step);
        break;
      case 4: // Generate
        renderCodeDiff(displayEl, injectedSource);
        break;
      case 5: // Restore
        renderCode(displayEl, restoredSource);
        break;
    }
  }

  // Click handlers
  stepButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      showStep(parseInt(btn.dataset.step, 10));
    });
  });

  // Initial state
  showStep(0);
}

// ══════════════════════════════════════════════
// DEMO 1: Jitter Animation
// ══════════════════════════════════════════════

const OPERATIONS = ['fetchUser', 'loadPrefs', 'getCart', 'checkAuth', 'loadTheme', 'syncNotif'];
const BASE_DURATION = 200; // ms for bar fill animation
const DELAY_SCALE = 8; // scale computed delays for visibility

function initJitterDemo() {
  const seedInput = document.getElementById('jitter-seed');
  const runBtn = document.getElementById('jitter-run');
  const withoutEl = document.getElementById('jitter-without');
  const withEl = document.getElementById('jitter-with');

  // Build bar DOM for both panels
  function buildBars(container) {
    container.innerHTML = '';
    return OPERATIONS.map((op, i) => {
      const row = document.createElement('div');
      row.className = 'jitter-row';

      const label = document.createElement('div');
      label.className = 'jitter-label';
      label.textContent = op;

      const track = document.createElement('div');
      track.className = 'jitter-track';

      const bar = document.createElement('div');
      bar.className = `jitter-bar c${i}`;

      const badge = document.createElement('span');
      badge.className = 'order-badge';
      bar.appendChild(badge);

      track.appendChild(bar);
      row.appendChild(label);
      row.appendChild(track);
      container.appendChild(row);

      return { bar, badge };
    });
  }

  const withoutBars = buildBars(withoutEl);
  const withBars = buildBars(withEl);

  let animId = null;

  // Stepper +/- buttons for seed
  seedInput.closest('.stepper').querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      seedInput.value = (parseInt(seedInput.value, 10) || 0) + delta;
      runBtn.click();
    });
  });

  runBtn.addEventListener('click', () => {
    const seed = parseInt(seedInput.value, 10) || 42;

    // Cancel any ongoing animation
    if (animId) cancelAnimationFrame(animId);

    // Reset bars
    [...withoutBars, ...withBars].forEach(({ bar, badge }) => {
      bar.style.width = '0%';
      badge.textContent = '';
      badge.classList.remove('visible');
    });

    // Compute delays for "with" panel
    const delays = OPERATIONS.map((op, i) => computeDelay(seed, 'demo.js', op, i) * DELAY_SCALE);

    // Build completion order for "with" panel
    const indexed = delays.map((d, i) => ({ d, i }));
    indexed.sort((a, b) => a.d - b.d);
    const completionOrder = new Array(OPERATIONS.length);
    indexed.forEach(({ i }, rank) => {
      completionOrder[i] = rank + 1;
    });

    const start = performance.now();
    const maxDelay = Math.max(...delays);
    const totalDuration = maxDelay + BASE_DURATION;

    function frame(now) {
      const elapsed = now - start;

      // "Without" panel: all start immediately, complete together
      const withoutProgress = Math.min(elapsed / BASE_DURATION, 1);
      withoutBars.forEach(({ bar, badge }, i) => {
        bar.style.width = `${withoutProgress * 100}%`;
        if (withoutProgress >= 1 && !badge.textContent) {
          badge.textContent = `#${i + 1}`;
          badge.classList.add('visible');
        }
      });

      // "With" panel: staggered start based on delays
      withBars.forEach(({ bar, badge }, i) => {
        const delayedElapsed = elapsed - delays[i];
        if (delayedElapsed < 0) {
          bar.style.width = '0%';
          return;
        }
        const progress = Math.min(delayedElapsed / BASE_DURATION, 1);
        bar.style.width = `${progress * 100}%`;
        if (progress >= 1 && !badge.textContent) {
          badge.textContent = `#${completionOrder[i]}`;
          badge.classList.add('visible');
        }
      });

      if (elapsed < totalDuration + 50) {
        animId = requestAnimationFrame(frame);
      }
    }

    animId = requestAnimationFrame(frame);
  });
}

// ══════════════════════════════════════════════
// DEMO 2: Code Before/After
// ══════════════════════════════════════════════

function initCodeDemo() {
  const modeGroup = document.getElementById('code-mode');
  const modeButtons = modeGroup.querySelectorAll('button');
  const seedInput = document.getElementById('code-seed');
  const originalEl = document.getElementById('code-original');
  const injectedEl = document.getElementById('code-injected');
  const leftBlock = originalEl.closest('.code-block');
  const rightBlock = injectedEl.closest('.code-block');

  let isInjected = false;
  let syncing = false;

  // Scroll sync between panels
  function onScroll(src, dst) {
    if (syncing) return;
    syncing = true;
    dst.scrollTop = src.scrollTop;
    dst.scrollLeft = src.scrollLeft;
    syncing = false;
  }
  leftBlock.addEventListener('scroll', () => onScroll(leftBlock, rightBlock));
  rightBlock.addEventListener('scroll', () => onScroll(rightBlock, leftBlock));

  function doInject() {
    const mode = modeGroup.querySelector('button.active').dataset.value;
    const seed = parseInt(seedInput.value, 10) || 42;

    const result = adapter.inject(SAMPLE_CODE, {
      filePath: 'src/user.js',
      mode,
      seed,
      delayConfig: { minMs: 0, maxMs: 50, distribution: 'uniform' },
      skipTryCatch: false,
      skipGenerators: true,
    });

    // Detect which lines are injected
    const injectedLines = new Set();
    result.source.split('\n').forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.includes(MARKER_PREFIX)) injectedLines.add(i + 1);
      if (new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\(`).test(trimmed)) injectedLines.add(i + 1);
      if (/import\s.*flake-monster\.runtime/.test(trimmed)) injectedLines.add(i + 1);
    });

    // Build aligned side-by-side diff
    const origLines = highlightToLines(SAMPLE_CODE);
    const injLines = highlightToLines(result.source);
    let leftHtml = '';
    let rightHtml = '';
    let origIdx = 0;

    for (let i = 0; i < injLines.length; i++) {
      const injNum = String(i + 1).padStart(2);

      if (injectedLines.has(i + 1)) {
        leftHtml += `<div class="code-line line-spacer"></div>`;
        rightHtml += `<div class="code-line line-added"><span class="line-num">${injNum}</span><span class="line-gutter">+</span>${injLines[i]}</div>`;
      } else {
        const origNum = String(origIdx + 1).padStart(2);
        leftHtml += `<div class="code-line"><span class="line-num">${origNum}</span><span class="line-gutter"> </span>${origLines[origIdx]}</div>`;
        rightHtml += `<div class="code-line"><span class="line-num">${injNum}</span><span class="line-gutter"> </span>${injLines[i]}</div>`;
        origIdx++;
      }
    }

    originalEl.innerHTML = leftHtml;
    injectedEl.innerHTML = rightHtml;
    leftBlock.scrollTop = 0;
    rightBlock.scrollTop = 0;

    isInjected = true;
  }

  doInject();

  // Toggle buttons for mode
  modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      modeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (isInjected) doInject();
    });
  });

  // Stepper +/- buttons for seed
  seedInput.closest('.stepper').querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.dataset.delta, 10);
      seedInput.value = (parseInt(seedInput.value, 10) || 0) + delta;
      if (isInjected) doInject();
    });
  });

  // Manual seed typing
  seedInput.addEventListener('input', () => {
    if (isInjected) doInject();
  });

}

// ══════════════════════════════════════════════
// DEMO 3: Seed Explorer
// ══════════════════════════════════════════════

function initSeedDemo() {
  const playBtn = document.getElementById('seed-play');
  const playIcon = document.getElementById('seed-play-icon');
  const bodyEl = document.getElementById('se-body');
  const breakdownEl = document.getElementById('seed-breakdown');

  const MAX_MS = 50;
  const VISIBLE_ROWS = 8;
  const TICK_MS = 800;
  const COLORS = ['#89b4fa', '#a6e3a1', '#cba6f7'];
  const COLOR_CLASSES = ['file-blue', 'file-green', 'file-purple'];

  const FILES = [
    { file: 'src/user.js',  fn: 'loadUser' },
    { file: 'src/cart.js',  fn: 'getCart' },
    { file: 'lib/auth.js',  fn: 'checkAuth' },
  ];

  let currentSeed = 42;
  let playing = true;
  let intervalId = null;

  // Build a row element for a given seed
  function buildRow(seed, animate) {
    const row = document.createElement('div');
    row.className = 'se-row' + (animate ? ' se-row-latest se-row-enter' : '');

    // Seed label
    const label = document.createElement('div');
    label.className = 'se-seed-label';
    label.textContent = seed;
    row.appendChild(label);

    // One bar per file (no wrapper cell, just bar + value inline)
    for (let fi = 0; fi < FILES.length; fi++) {
      const { file, fn } = FILES[fi];
      const ms = computeDelay(seed, file, fn, 0, 0, MAX_MS);
      const pct = (ms / MAX_MS) * 100;

      const cell = document.createElement('div');
      cell.className = 'se-cell';

      const bar = document.createElement('div');
      bar.className = 'se-bar';
      bar.style.background = COLORS[fi];
      bar.style.width = animate ? '0%' : `${pct.toFixed(1)}%`;

      const val = document.createElement('span');
      val.className = 'se-val';
      val.textContent = `${ms.toFixed(1)}`;

      cell.appendChild(bar);
      cell.appendChild(val);
      row.appendChild(cell);

      if (animate) {
        requestAnimationFrame(() => {
          bar.style.width = `${pct.toFixed(1)}%`;
        });
      }
    }

    return row;
  }

  // Render the math breakdown for a given seed
  function updateBreakdown(seed) {
    let html = `<span class="dim">seed </span><span class="val">${seed}</span>\n`;

    for (let fi = 0; fi < FILES.length; fi++) {
      const { file, fn } = FILES[fi];
      const ctx = `${file}:${fn}:0`;
      const contextSeed = deriveSeed(seed, ctx);
      const rng = createRng(contextSeed);
      const rngVal = rng();
      const ms = computeDelay(seed, file, fn, 0, 0, MAX_MS);

      html += `\n<span class="${COLOR_CLASSES[fi]}">${file}:${fn}</span>\n`;
      html += `  <span class="dim">${seed} + hash("${escHtml(ctx)}")</span>`;
      html += ` <span class="arrow">\u2192</span> <span class="dim">mulberry32(</span><span class="val">${contextSeed}</span><span class="dim">)</span>`;
      html += ` <span class="arrow">\u2192</span> <span class="val">${rngVal.toFixed(6)}</span>`;
      html += ` <span class="arrow">\u2192</span> <span class="val">${ms.toFixed(1)}</span><span class="dim"> ms</span>`;
    }

    breakdownEl.innerHTML = html;
  }

  function tick() {
    // Remove "latest" highlight from previous row
    const prev = bodyEl.querySelector('.se-row-latest');
    if (prev) {
      prev.classList.remove('se-row-latest');
      prev.classList.remove('se-row-enter');
    }

    // Add new row at the bottom
    const row = buildRow(currentSeed, true);
    bodyEl.appendChild(row);

    // Remove oldest row if we exceed VISIBLE_ROWS.
    // Remove it immediately to avoid accumulation, no animation on exit.
    if (bodyEl.children.length > VISIBLE_ROWS) {
      bodyEl.firstElementChild.remove();
    }

    updateBreakdown(currentSeed);
    currentSeed++;
  }

  function startPlaying() {
    playing = true;
    playIcon.innerHTML = '&#9646;&#9646;';
    intervalId = setInterval(tick, TICK_MS);
  }

  function stopPlaying() {
    playing = false;
    playIcon.innerHTML = '&#9654;';
    clearInterval(intervalId);
    intervalId = null;
  }

  playBtn.addEventListener('click', () => {
    if (playing) stopPlaying();
    else startPlaying();
  });

  // Pre-fill rows
  for (let i = 0; i < VISIBLE_ROWS; i++) {
    bodyEl.appendChild(buildRow(currentSeed, false));
    currentSeed++;
  }

  // Highlight last pre-filled row
  const lastRow = bodyEl.lastElementChild;
  if (lastRow) lastRow.classList.add('se-row-latest');

  updateBreakdown(currentSeed - 1);
  startPlaying();
}

// ── Boot ──

document.addEventListener('DOMContentLoaded', () => {
  initPipelineDemo();
  initJitterDemo();
  initCodeDemo();
  initSeedDemo();
});
