/**
 * Analyzes test results across multiple runs to classify tests as
 * flaky, stable-pass, or always-failing.
 *
 * @param {Object[]} results - Array of run results, each with:
 *   { runIndex, seed, exitCode, parsed, tests: [{ name, status }] }
 * @returns {{ totalTests, flakyTests, stableTests, alwaysFailingTests }}
 */
export function analyzeFlakiness(results) {
  // Build map: testName → { passedRuns: number[], failedRuns: number[] }
  const testMap = new Map();

  for (const run of results) {
    if (!run.parsed || !run.tests) continue;

    for (const test of run.tests) {
      if (test.status === 'skipped') continue;

      if (!testMap.has(test.name)) {
        testMap.set(test.name, { file: test.file, passedRuns: [], failedRuns: [] });
      }
      const entry = testMap.get(test.name);
      if (test.status === 'passed') {
        entry.passedRuns.push(run.runIndex);
      } else if (test.status === 'failed') {
        entry.failedRuns.push(run.runIndex);
      }
    }
  }

  const flakyTests = [];
  const stableTests = [];
  const alwaysFailingTests = [];

  for (const [name, entry] of testMap) {
    const hasPasses = entry.passedRuns.length > 0;
    const hasFailures = entry.failedRuns.length > 0;

    if (hasPasses && hasFailures) {
      const totalRuns = entry.passedRuns.length + entry.failedRuns.length;
      flakyTests.push({
        name,
        file: entry.file,
        passedRuns: entry.passedRuns,
        failedRuns: entry.failedRuns,
        flakyRate: entry.failedRuns.length / totalRuns,
      });
    } else if (hasPasses) {
      stableTests.push({ name, file: entry.file, verdict: 'stable-pass' });
    } else if (hasFailures) {
      alwaysFailingTests.push({ name, file: entry.file, verdict: 'always-failing' });
    }
  }

  // Sort flaky tests by flaky rate descending
  flakyTests.sort((a, b) => b.flakyRate - a.flakyRate);

  return {
    totalTests: testMap.size,
    flakyTests,
    stableTests,
    alwaysFailingTests,
  };
}
