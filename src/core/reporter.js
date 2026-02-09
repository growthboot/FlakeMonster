/**
 * Formats test run results for terminal output.
 */
export class Reporter {
  /**
   * Print a summary of all test runs.
   * @param {Object[]} results - Array of per-run results
   *   Each: { runIndex, seed, exitCode, stdout, stderr, durationMs, workspacePath, kept }
   * @param {number} totalRuns
   */
  summarize(results, totalRuns) {
    console.log('\n--- FlakeMonster Results ---\n');

    const failures = [];

    for (const r of results) {
      const status = r.exitCode === 0 ? 'PASS' : 'FAIL';
      const dur = (r.durationMs / 1000).toFixed(1);
      let line = `  Run ${r.runIndex + 1}/${totalRuns}: ${status} (seed=${r.seed}, ${dur}s)`;

      if (r.exitCode !== 0 && r.kept) {
        line += `\n    Workspace kept: ${r.workspacePath}`;
      }

      console.log(line);

      if (r.exitCode !== 0) {
        failures.push(r);
      }
    }

    const passed = results.filter((r) => r.exitCode === 0).length;
    const failed = results.length - passed;

    console.log(`\n  Summary: ${passed}/${totalRuns} passed, ${failed}/${totalRuns} failed`);

    if (failures.length > 0) {
      const seeds = failures.map((f) => f.seed).join(', ');
      console.log(`  Failing seeds: ${seeds}`);
      console.log(`\n  Reproduce a failure:`);
      console.log(`    flake-monster test --runs 1 --seed ${failures[0].seed} --cmd "<your test command>"`);
    } else {
      console.log('\n  No flakes detected in this run.');
    }

    console.log('');
  }

  /**
   * Print a single run result in real-time (during execution).
   * @param {Object} result
   * @param {number} totalRuns
   */
  printRunResult(result, totalRuns) {
    const status = result.exitCode === 0 ? 'PASS' : 'FAIL';
    const dur = (result.durationMs / 1000).toFixed(1);
    let line = `  Run ${result.runIndex + 1}/${totalRuns}: ${status} (seed=${result.seed}, ${dur}s)`;

    if (result.exitCode !== 0 && result.kept) {
      line += ` — workspace kept`;
    }

    console.log(line);
  }
}
