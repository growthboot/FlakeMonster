/**
 * Parses TAP version 13 output, including nested subtests from node:test.
 *
 * node:test TAP output uses indentation (4 spaces per level) for subtests:
 *
 *   # Subtest: Cache
 *       # Subtest: warm-up populates all keys
 *       ok 1 - warm-up populates all keys
 *       1..1
 *   ok 1 - Cache
 *
 * We parse subtests to produce leaf-level test names like:
 *   "Cache > warm-up populates all keys"
 *
 * For flat TAP (no subtests), it works the same as before.
 */
export function parseTapOutput(stdout) {
  try {
    const lines = stdout.split('\n');
    const tests = [];
    let inYaml = false;
    let yamlLines = [];
    let yamlMessage = null;

    // Stack of parent subtest names, indexed by indent level
    const subtestStack = [];
    // Track which top-level tests have subtests (so we skip their summary line)
    const parentsWithSubtests = new Set();

    const TEST_LINE = /^(\s*)(ok|not ok)\s+(\d+)?\s*-?\s*(.*)/;
    const SUBTEST_LINE = /^(\s*)# Subtest:\s*(.*)/;
    const DIRECTIVE = /#\s*(skip|todo)\b/i;
    const DURATION = /duration_ms:\s*([\d.]+)/;
    const FILE_LINE = /file:\s*['"]?(.*?)['"]?\s*$/;

    for (const line of lines) {
      if (inYaml) {
        if (line.trim() === '...') {
          // End YAML block, attach to last test
          if (tests.length > 0 && tests[tests.length - 1].status === 'failed') {
            tests[tests.length - 1].failureMessage =
              yamlMessage || yamlLines.join('\n') || null;
          }
          // Extract duration and file from YAML for any test
          if (tests.length > 0) {
            for (const yl of yamlLines) {
              const durMatch = yl.match(DURATION);
              if (durMatch && tests[tests.length - 1].durationMs == null) {
                tests[tests.length - 1].durationMs = parseFloat(durMatch[1]);
              }
              const fileMatch = yl.match(FILE_LINE);
              if (fileMatch && !tests[tests.length - 1].file) {
                tests[tests.length - 1].file = fileMatch[1];
              }
            }
          }
          inYaml = false;
          yamlLines = [];
          yamlMessage = null;
          continue;
        }
        const trimmed = line.trim();
        yamlLines.push(trimmed);
        const msgMatch = trimmed.match(/^message:\s*['"]?(.*?)['"]?\s*$/);
        if (msgMatch) {
          yamlMessage = msgMatch[1];
        }
        continue;
      }

      // Check for YAML block start
      if (line.trim() === '---' && tests.length > 0) {
        inYaml = true;
        continue;
      }

      // Check for # Subtest: lines — track parent names at each indent level
      const subtestMatch = line.match(SUBTEST_LINE);
      if (subtestMatch) {
        const indent = subtestMatch[1].length;
        const level = Math.floor(indent / 4);
        subtestStack[level] = subtestMatch[2].trim();
        // Trim deeper levels
        subtestStack.length = level + 1;
        continue;
      }

      // Check for ok/not ok test result lines
      const match = line.match(TEST_LINE);
      if (!match) continue;

      const indent = match[1].length;
      const level = Math.floor(indent / 4);
      const ok = match[2] === 'ok';
      const description = match[4] || '';

      const directiveMatch = description.match(DIRECTIVE);
      let status;
      let name = description;

      if (directiveMatch) {
        status = 'skipped';
        name = description.slice(0, description.indexOf('#')).trim();
      } else {
        status = ok ? 'passed' : 'failed';
      }

      if (level > 0) {
        // This is a subtest result — build compound name from parent stack
        const parents = subtestStack.slice(0, level).filter(Boolean);
        if (parents.length > 0) {
          name = parents.join(' > ') + ' > ' + name;
          // Mark each parent so we skip their summary line
          parentsWithSubtests.add(parents[0]);
        }

        tests.push({
          name,
          file: null,
          status,
          durationMs: null,
          failureMessage: null,
        });
      } else {
        // Top-level result — only include if it has NO subtests (flat TAP)
        if (!parentsWithSubtests.has(name)) {
          tests.push({
            name,
            file: null,
            status,
            durationMs: null,
            failureMessage: null,
          });
        }
      }
    }

    if (tests.length === 0) {
      return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
    }

    return {
      parsed: true,
      tests,
      totalPassed: tests.filter(t => t.status === 'passed').length,
      totalFailed: tests.filter(t => t.status === 'failed').length,
      totalSkipped: tests.filter(t => t.status === 'skipped').length,
    };
  } catch {
    return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
  }
}
