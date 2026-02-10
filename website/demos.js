/**
 * FlakeMonster interactive demos.
 * Imports the browser adapter and syntax highlighter.
 */

import { createBrowserAdapter, MARKER_PREFIX, DELAY_OBJECT } from './adapter-browser.js';
import { highlightToLines } from './syntax.js';

const adapter = createBrowserAdapter();

// ── RNG helpers (inlined from runtime for computing delays without waiting) ──

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

function computeDelay(seed, file, fn, n, minMs = 0, maxMs = 50) {
  const contextSeed = (seed + hashString(`${file}:${fn}:${n}`)) | 0;
  const rng = mulberry32(contextSeed);
  return minMs + rng() * (maxMs - minMs);
}

// ── Sample code for Code Before/After demo ──

const SAMPLE_CODE = `import { fetchData } from './api.js';

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
  const injectBtn = document.getElementById('code-inject');
  const restoreBtn = document.getElementById('code-restore');
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

  // Render a plain code panel with line numbers + gutter
  function renderPlain(el, source) {
    const lines = highlightToLines(source);
    el.innerHTML = lines.map((lineHtml, i) => {
      const num = String(i + 1).padStart(2);
      return `<div class="code-line"><span class="line-num">${num}</span><span class="line-gutter"> </span>${lineHtml}</div>`;
    }).join('\n');
  }

  // Initial state: both panels show the same original code
  function showOriginal() {
    renderPlain(originalEl, SAMPLE_CODE);
    renderPlain(injectedEl, SAMPLE_CODE);
  }

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
      if (new RegExp(`await\\s+${DELAY_OBJECT}\\s*\\.\\s*delay\\s*\\(`).test(trimmed)) injectedLines.add(i + 1);
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
    injectBtn.disabled = true;
    restoreBtn.disabled = false;
  }

  showOriginal();

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

  injectBtn.addEventListener('click', doInject);

  restoreBtn.addEventListener('click', () => {
    isInjected = false;
    showOriginal();
    leftBlock.scrollTop = 0;
    rightBlock.scrollTop = 0;

    injectBtn.disabled = false;
    restoreBtn.disabled = true;
  });
}

// ══════════════════════════════════════════════
// DEMO 3: Seed Explorer
// ══════════════════════════════════════════════

function initSeedDemo() {
  const seedInput = document.getElementById('seed-value');
  const fileInput = document.getElementById('seed-file');
  const fnInput = document.getElementById('seed-fn');
  const chartEl = document.getElementById('seed-chart');
  const breakdownEl = document.getElementById('seed-breakdown');

  const POSITIONS = 8;
  const MAX_MS = 50;

  function update() {
    const seed = parseInt(seedInput.value, 10) || 42;
    const file = fileInput.value || 'src/user.js';
    const fn = fnInput.value || 'loadUser';

    let html = '';
    const delays = [];

    for (let n = 0; n < POSITIONS; n++) {
      const ms = computeDelay(seed, file, fn, n, 0, MAX_MS);
      delays.push(ms);
      const pct = (ms / MAX_MS) * 100;
      html += `
        <div class="seed-row">
          <div class="seed-row-label">n=${n}</div>
          <div class="seed-bar-track">
            <div class="seed-bar" style="width:${pct.toFixed(1)}%"></div>
          </div>
          <div class="seed-row-value">${ms.toFixed(1)}ms</div>
        </div>`;
    }

    chartEl.innerHTML = html;

    // Show math breakdown for n=0
    const ctx = `${file}:${fn}:0`;
    const ctxHash = hashString(ctx);
    const contextSeed = (seed + ctxHash) | 0;
    const rng = mulberry32(contextSeed);
    const rngVal = rng();

    breakdownEl.innerHTML =
      `<span class="dim">seed=</span><span class="val">${seed}</span>` +
      ` <span class="dim">+ hash("${ctx}") =</span> <span class="val">${ctxHash}</span>\n` +
      `<span class="dim">contextSeed =</span> <span class="val">${contextSeed}</span>\n` +
      `<span class="dim">mulberry32(${contextSeed}) =</span> <span class="val">${rngVal.toFixed(6)}</span>\n` +
      `<span class="dim">delay = 0 + ${rngVal.toFixed(6)} * ${MAX_MS} =</span> <span class="val">${delays[0].toFixed(1)}ms</span>`;
  }

  // Debounced update
  let timer = null;
  function debouncedUpdate() {
    clearTimeout(timer);
    timer = setTimeout(update, 100);
  }

  seedInput.addEventListener('input', debouncedUpdate);
  fileInput.addEventListener('input', debouncedUpdate);
  fnInput.addEventListener('input', debouncedUpdate);

  // Initial render
  update();
}

// ── Boot ──

document.addEventListener('DOMContentLoaded', () => {
  initJitterDemo();
  initCodeDemo();
  initSeedDemo();
});
