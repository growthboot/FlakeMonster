/**
 * Parses Jest JSON output (from `jest --json`).
 *
 * Jest JSON schema:
 * {
 *   testResults: [{
 *     testFilePath: string,
 *     testResults: [{
 *       fullName: string,
 *       status: "passed" | "failed" | "pending",
 *       duration: number (ms),
 *       failureMessages: string[]
 *     }]
 *   }]
 * }
 */
export function parseJestOutput(stdout) {
  try {
    const data = JSON.parse(stdout);
    if (!data.testResults || !Array.isArray(data.testResults)) {
      return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
    }

    const tests = [];
    for (const suite of data.testResults) {
      const file = suite.testFilePath || '';
      for (const t of suite.testResults || []) {
        const status =
          t.status === 'passed' ? 'passed' :
          t.status === 'failed' ? 'failed' : 'skipped';

        tests.push({
          name: t.fullName || t.title || '',
          file,
          status,
          durationMs: t.duration ?? null,
          failureMessage: t.failureMessages?.length ? t.failureMessages.join('\n') : null,
        });
      }
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
