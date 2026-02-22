/**
 * Parses Playwright JSON reporter output (from `--reporter=json`).
 *
 * Playwright JSON schema:
 * {
 *   suites: [{
 *     title: string,
 *     file: string,
 *     suites: [...],        // nested suites
 *     specs: [{
 *       title: string,
 *       file: string,
 *       tests: [{
 *         projectName: string,
 *         results: [{
 *           status: "passed" | "failed" | "timedOut" | "skipped" | "interrupted",
 *           duration: number (ms),
 *           error?: { message: string, stack?: string }
 *         }],
 *         status: "expected" | "unexpected" | "flaky" | "skipped"
 *       }]
 *     }]
 *   }]
 * }
 *
 * Each spec may have multiple tests (one per project/browser).
 * Each test may have multiple results (retries), but we use the
 * overall test.status to determine passed/failed/skipped.
 * Duration is summed from all results for that test.
 */
export function parsePlaywrightOutput(stdout) {
  try {
    const data = JSON.parse(stdout);
    if (!data.suites || !Array.isArray(data.suites)) {
      return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
    }

    const tests = [];
    collectTests(data.suites, [], tests);

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

/**
 * Recursively walk suites and collect leaf test entries.
 */
function collectTests(suites, titlePath, out) {
  for (const suite of suites) {
    const currentPath = suite.title ? [...titlePath, suite.title] : titlePath;

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const nameParts = [...currentPath, spec.title].filter(Boolean);
        const name = nameParts.join(' > ');

        const status =
          test.status === 'skipped' ? 'skipped' :
          test.status === 'expected' ? 'passed' : 'failed';

        const results = test.results || [];
        const durationMs = results.reduce((sum, r) => sum + (r.duration ?? 0), 0);

        // Find the first error message from results
        let failureMessage = null;
        if (status === 'failed') {
          for (const r of results) {
            if (r.error) {
              failureMessage = r.error.message || r.error.stack || String(r.error);
              break;
            }
          }
        }

        out.push({
          name,
          file: spec.file || suite.file || null,
          status,
          durationMs: results.length > 0 ? durationMs : null,
          failureMessage,
        });
      }
    }

    // Recurse into nested suites
    if (suite.suites) {
      collectTests(suite.suites, currentPath, out);
    }
  }
}
