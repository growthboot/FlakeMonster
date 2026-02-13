/**
 * Parses node:test JSON reporter output (NDJSON).
 *
 * Each line is a JSON object with:
 *   type: "test:pass" | "test:fail" | "test:start" | "test:plan" | ...
 *   data: { name, nesting, details: { duration_ms, error? }, file? }
 *
 * We only care about "test:pass" and "test:fail" events.
 * Filter to leaf tests: nesting > 0, or nesting === 0 if no nested tests exist.
 */
export function parseNodeTestOutput(stdout) {
  try {
    const lines = stdout.split('\n').filter(l => l.trim());
    const events = [];

    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // skip non-JSON lines (e.g. stderr mixed in)
      }
    }

    const testEvents = events.filter(
      e => e.type === 'test:pass' || e.type === 'test:fail'
    );

    if (testEvents.length === 0) {
      return { parsed: false, tests: [], totalPassed: 0, totalFailed: 0, totalSkipped: 0 };
    }

    // Determine which events are leaf tests (not describe blocks).
    // Describe blocks at nesting 0 have child tests at nesting > 0.
    // If ALL events are nesting 0, they're individual tests (no describes).
    const maxNesting = Math.max(...testEvents.map(e => e.data?.nesting ?? 0));
    const leafEvents = maxNesting > 0
      ? testEvents.filter(e => (e.data?.nesting ?? 0) > 0)
      : testEvents;

    const tests = leafEvents.map(e => {
      const d = e.data || {};
      const status = e.type === 'test:pass' ? 'passed' : 'failed';
      const error = d.details?.error;

      return {
        name: d.name || '',
        file: d.file || '',
        status,
        durationMs: d.details?.duration_ms ?? null,
        failureMessage: error ? (error.message || String(error)) : null,
      };
    });

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
