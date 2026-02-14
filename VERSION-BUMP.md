# Version Bump Checklist

When updating the version number, update **all** of these locations in `lib-repo/`:

- [ ] `package.json` — `"version"` field
- [ ] `index.html` — `copyTexts.cdn` string (line with `unpkg.com/flake-monster@`)
- [ ] `index.html` — `copyTexts.download` string (line with `registry.npmjs.org/flake-monster/-/flake-monster-`)
- [ ] `index.html` — CDN display panel (`unpkg.com/flake-monster@`)
- [ ] `index.html` — Download display panel (`registry.npmjs.org/flake-monster/-/flake-monster-`)
- [ ] `index.html` — Hero version badge (`<span class="hero-version">`)

Quick grep to verify: `grep -n "0\.X\.Y" index.html package.json`
