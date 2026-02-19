/**
 * Formats test run results for terminal output.
 * Accepts an optional terminal helpers object for colored/styled output.
 */

/** No-op terminal helpers (used when no real terminal is injected). */
const NOOP_TERMINAL = {
  bold: (s) => s,
  dim: (s) => s,
  red: (s) => s,
  green: (s) => s,
  yellow: (s) => s,
  cyan: (s) => s,
  progressBar: (c, t) => `${c}/${t}`,
  box: (lines) => lines.join('\n'),
};

export class Reporter {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.quiet=false] - Suppress all output
   * @param {Object} [options.terminal] - Terminal helpers (colors, progressBar, box)
   */
  constructor({ quiet = false, terminal = null } = {}) {
    this.quiet = quiet;
    this.t = terminal || NOOP_TERMINAL;
  }

  log(...args) {
    if (!this.quiet) console.log(...args);
  }

  /**
   * Print injection scan stats after engine.injectAll().
   * @param {import('./manifest.js').Manifest} manifest
   */
  printInjectionStats(manifest) {
    if (this.quiet) return;
    const { dim, cyan } = this.t;
    const fileCount = Object.keys(manifest.getFiles()).length;
    const injections = manifest.getTotalInjections();
    console.log(`  ${cyan('\u2713')} ${injections} injection points across ${fileCount} file(s)`);
  }

  /**
   * Print a single run result in real-time (during execution).
   * @param {Object} result
   * @param {number} totalRuns
   */
  printRunResult(result, totalRuns) {
    if (this.quiet) return;
    const { dim, red, green } = this.t;
    const pass = result.exitCode === 0;
    const icon = pass ? green('\u2713') : red('\u2717');
    const status = pass ? green('PASS') : red('FAIL');
    const dur = (result.durationMs / 1000).toFixed(1);

    let line = `  ${icon} Run ${result.runIndex + 1}/${totalRuns}  ${status}  seed=${dim(String(result.seed))}  ${dur}s`;

    if (result.parsed && result.tests && result.tests.length > 0) {
      const passed = result.tests.filter((t) => t.status === 'passed').length;
      const failed = result.tests.filter((t) => t.status === 'failed').length;
      let counts = `${passed} passed`;
      if (failed > 0) counts += `, ${red(String(failed) + ' failed')}`;
      line += `  (${counts})`;
    }

    if (result.exitCode !== 0 && result.kept) {
      line += `  ${dim('\u2014 workspace kept')}`;
    }

    console.log(line);
  }

  /**
   * Print a running tally / progress bar between runs.
   * @param {Object[]} results - Results so far
   * @param {number} totalRuns
   */
  printProgressTally(results, totalRuns) {
    if (this.quiet) return;
    const { dim, green, red } = this.t;
    const passed = results.filter((r) => r.exitCode === 0).length;
    const failed = results.length - passed;
    const bar = this.t.progressBar(results.length, totalRuns);
    console.log(`  ${dim(bar)}  ${green(String(passed) + ' passed')}  ${failed > 0 ? red(String(failed) + ' failed') : dim('0 failed')}`);
    console.log('');
  }

  /**
   * Print restoration confirmation.
   * @param {{ filesRestored: number, injectionsRemoved: number }} stats
   */
  printRestorationResult({ filesRestored }) {
    if (this.quiet) return;
    const { cyan } = this.t;
    console.log(`\n  ${cyan('\u2713')} Source files restored (${filesRestored} files)`);
  }

  /**
   * Print a rich summary of all test runs.
   * @param {Object[]} results - Array of per-run results
   * @param {number} totalRuns
   * @param {Object} [analysis] - Flakiness analysis from analyzeFlakiness()
   * @param {number} [totalElapsedMs] - Total wall-clock time
   */
  summarize(results, totalRuns, analysis = null, totalElapsedMs = null) {
    if (this.quiet) return;
    const { bold, dim, red, green, yellow } = this.t;

    const passed = results.filter((r) => r.exitCode === 0).length;
    const failed = results.length - passed;
    const failures = results.filter((r) => r.exitCode !== 0);

    const lines = [];
    lines.push(bold('FlakeMonster Results'));
    lines.push('');
    lines.push(`Runs: ${passed}/${totalRuns} passed, ${failed}/${totalRuns} failed`);

    if (totalElapsedMs != null) {
      const secs = totalElapsedMs / 1000;
      if (secs >= 60) {
        const mins = Math.floor(secs / 60);
        const rem = Math.round(secs % 60);
        lines.push(`Total time: ${mins}m ${rem}s`);
      } else {
        lines.push(`Total time: ${secs.toFixed(1)}s`);
      }
    }

    // Flaky test details
    if (analysis && analysis.flakyTests.length > 0) {
      lines.push('');
      lines.push(yellow(`Flaky tests (${analysis.flakyTests.length}):`));
      for (const t of analysis.flakyTests) {
        const rate = (t.flakyRate * 100).toFixed(0);
        const seeds = t.failedRuns
          .map((i) => {
            const r = results[i];
            return r ? String(r.seed) : String(i);
          })
          .join(', ');
        lines.push(`  ${red(rate + '%')} ${t.name}`);
        lines.push(`       ${dim(`file: ${t.file || 'unknown'}  seeds: ${seeds}`)}`);
      }
    }

    if (analysis && analysis.alwaysFailingTests.length > 0) {
      lines.push('');
      lines.push(red(`Always failing (${analysis.alwaysFailingTests.length}):`));
      for (const t of analysis.alwaysFailingTests) {
        lines.push(`  ${t.name} ${dim(`(${t.file || 'unknown'})`)}`);
      }
    }

    if (failures.length > 0) {
      lines.push('');
      lines.push('Reproduce:');
      lines.push(dim(`  flake-monster test --runs 1 --seed ${failures[0].seed}`));
    } else {
      lines.push('');
      lines.push(green('No flakes detected.'));
    }

    console.log('\n' + this.t.box(lines) + '\n');
  }
}
