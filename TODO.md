# FlakeMonster Website TODO

Static demo site — works locally via `file://` or hosted on a CDN. All vanilla JS, no build step.

## Structure
- [ ] `index.html` in project root
- [ ] `website/` folder for all other assets (CSS, JS, SVG)

## Logo
- [ ] Design SVG logo (monster/creature theme, relates to flaky tests)
- [ ] Embed in `website/logo.svg`
- [ ] Use in page header and favicon

## Styles
- [ ] `website/styles.css` — layout, typography, animations, responsive

## Demos (use the library directly, no mock data)

### Jitter Animation
- [ ] Side-by-side visual: operations executing without FlakeMonster (instant, identical order every time) vs with FlakeMonster (varied timing, reordered)
- [ ] Animate bars/blocks representing async operations completing at different times
- [ ] Let user set the seed — same seed replays the same jitter pattern
- [ ] Show how different seeds produce different timing but same seed is always reproducible

### Code Before/After
- [ ] Show a real code snippet, run it through the adapter's `inject()` live in the browser
- [ ] Display original and injected code side-by-side with syntax highlighting
- [ ] Highlight the injected lines (delay calls + marker comments + runtime import)
- [ ] Let user pick mode (light/medium/hardcore) and seed to see how output changes
- [ ] Add a "Restore" button that runs `remove()` and shows the code returning to original

### Seed Explorer
- [ ] Input field for seed value
- [ ] Show how the same seed + file + function + position always produces the same delay duration
- [ ] Visualize the deterministic RNG output as a timeline or bar chart

## Scripts
- [ ] `website/demos.js` — demo logic, imports adapter/runtime directly via ES modules
- [ ] `website/syntax.js` — minimal JS syntax highlighter (no external deps)
- [ ] Bundle or reference the adapter/runtime so it works without node_modules (browser ESM)

## Browser Compatibility
- [ ] Ensure adapter code runs in browser (Acorn/astring/astravel are browser-compatible)
- [ ] ES module imports via `<script type="module">`
- [ ] No Node.js APIs used in demo code paths
