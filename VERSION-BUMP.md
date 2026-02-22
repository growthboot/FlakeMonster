# Version Release Process

This document is the step-by-step guide for releasing a new version of FlakeMonster to npm. Follow it exactly — it covers version bumping, changelog management, publishing, and post-publish verification.

---

## 1. Logging Changes (Ongoing)

As you work on features, fixes, or improvements — **before any release** — add entries to the **Unreleased** section at the top of `VERSIONS.md`:

```md
## Unreleased

- Added: profile system for named delay configurations
- Fixed: marker comment not stripped when delay is on last line
- Changed: CLI now exits with code 1 on injection failure
```

Use prefixes: **Added**, **Fixed**, **Changed**, **Removed**, **Internal**.

This happens continuously across commits. One version release may span many commits.

---

## 2. Decide to Release

When the unreleased changes are ready to ship:

1. Choose the new version number (semver: `MAJOR.MINOR.PATCH`)
2. Proceed to Step 3

---

## 3. Bump the Version Number

Update **all** of these locations in `lib-repo/`:

- [ ] `package.json` — `"version"` field
- [ ] `index.html` — `copyTexts.cdn` string (line with `unpkg.com/flake-monster@`)
- [ ] `index.html` — `copyTexts.download` string (line with `registry.npmjs.org/flake-monster/-/flake-monster-`)
- [ ] `index.html` — CDN display panel (`unpkg.com/flake-monster@`)
- [ ] `index.html` — Download display panel (`registry.npmjs.org/flake-monster/-/flake-monster-`)
- [ ] `index.html` — Hero version badge (`<span class="hero-version">`)

**Verify** with a grep (replace `X.Y.Z` with the OLD version — nothing should remain):

```sh
grep -n "OLD_VERSION" lib-repo/index.html lib-repo/package.json
```

---

## 4. Update VERSIONS.md

Move the **Unreleased** contents into a new version entry:

1. Create a new heading under **Released Versions** at the top of the list:
   ```md
   ### X.Y.Z — YYYY-MM-DD — `<commit-sha>`
   ```
2. Move all bullet points from the **Unreleased** section into this new entry
3. Reset the **Unreleased** section:
   ```md
   ## Unreleased

   - _(no unreleased changes logged yet)_
   ```

The commit SHA is filled in after committing (Step 5), so leave it as a placeholder or fill it in with an amend.

---

## 5. Commit

Commit all changes with the message format:

```
release: vX.Y.Z
```

Then grab the commit SHA and update the version entry in `VERSIONS.md` if you left it as a placeholder. Amend the commit if needed.

---

## 6. Publish

From `lib-repo/`:

```sh
npm publish
```

---

## 7. Post-Publish Verification

Confirm the version is live:

```sh
npm view flake-monster version
```

Expected output: `X.Y.Z`

---

## Quick Reference

| Step | Action |
|------|--------|
| Ongoing | Add entries to `VERSIONS.md` → Unreleased |
| 1 | Pick version number |
| 2 | Bump version in `package.json` + `index.html` (6 locations) |
| 3 | Move Unreleased → new version entry in `VERSIONS.md` |
| 4 | Commit as `release: vX.Y.Z` |
| 5 | `npm publish` from `lib-repo/` |
| 6 | Verify with `npm view flake-monster version` |
