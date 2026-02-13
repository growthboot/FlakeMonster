/**
 * Parses TAP version 13 output.
 *
 * TAP lines:
 *   ok N - description
 *   not ok N - description
 *   ok N - description # skip reason
 *   ok N - description # todo reason
 *   --- (YAML diagnostic block start)
 *   ... (YAML diagnostic block end)
 *   1..N (plan line, ignored)
 *   TAP version 13 (version line, ignored)
 */
export function parseTapOutput(stdout) {
  try {
    const lines = stdout.split('\n');
    const tests = [];
    let inYaml = false;
    let yamlLines = [];
    let yamlMessage = null;

    const TEST_LINE = /^(ok|not ok)\s+(\d+)?\s*-?\s*(.*)/;
    const DIRECTIVE = /#\s*(skip|todo)\b/i;

    for (const line of lines) {
      if (inYaml) {
        if (line.trim() === '...') {
          // End YAML block, attach to last failed test
          if (tests.length > 0 && tests[tests.length - 1].status === 'failed') {
            tests[tests.length - 1].failureMessage =
              yamlMessage || yamlLines.join('\n') || null;
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

      if (line.trim() === '---' && tests.length > 0) {
        inYaml = true;
        continue;
      }

      const match = line.match(TEST_LINE);
      if (!match) continue;

      const ok = match[1] === 'ok';
      const description = match[3] || '';

      const directiveMatch = description.match(DIRECTIVE);
      let status;
      let name = description;

      if (directiveMatch) {
        status = 'skipped';
        name = description.slice(0, description.indexOf('#')).trim();
      } else {
        status = ok ? 'passed' : 'failed';
      }

      tests.push({
        name,
        file: null,
        status,
        durationMs: null,
        failureMessage: null,
      });
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
