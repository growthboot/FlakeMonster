import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { AdapterRegistry } from '../../adapters/registry.js';
import { createJavaScriptAdapter } from '../../adapters/javascript/index.js';
import { InjectorEngine } from '../../core/engine.js';
import { FlakeProfile } from '../../core/profile.js';
import { parseSeed } from '../../core/seed.js';
import { ProjectWorkspace, getFlakeMonsterDir } from '../../core/workspace.js';
import { Manifest } from '../../core/manifest.js';
import { loadConfig, mergeWithCliOptions } from '../../core/config.js';

function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function registerInjectCommand(program) {
  program
    .command('inject')
    .description('Inject async delays into source files')
    .argument('[globs...]', 'File patterns to process', ['src/**/*.js'])
    .option('-m, --mode <mode>', 'Injection density: light, medium, hardcore', 'medium')
    .option('-s, --seed <seed>', 'Random seed for deterministic delays (or "auto")', 'auto')
    .option('--in-place', 'Modify files in-place (default)', true)
    .option('--workspace', 'Create a workspace copy instead of modifying files in-place', false)
    .option('--min-delay <ms>', 'Minimum delay in milliseconds', '0')
    .option('--max-delay <ms>', 'Maximum delay in milliseconds', '50')
    .option('-e, --exclude <patterns...>', 'Glob patterns to exclude (appends to config defaults)')
    .action(async (globs, options) => {
      try {
        const projectRoot = resolve('.');
        const config = await loadConfig(projectRoot);
        const merged = mergeWithCliOptions(config, options);
        const seed = parseSeed(options.seed);

        const profile = FlakeProfile.fromConfig(merged);
        const registry = new AdapterRegistry();
        registry.register(createJavaScriptAdapter());
        const engine = new InjectorEngine(registry, profile);

        // Guard against double injection
        const flakeDirCheck = getFlakeMonsterDir(projectRoot);
        const existingManifest = await Manifest.load(flakeDirCheck);
        if (existingManifest) {
          console.log(
            `Active injection detected (seed: ${existingManifest.seed}, mode: ${existingManifest.mode}, injected at: ${existingManifest.createdAt}).`
          );
          const proceed = await confirm('Restore source files before re-injecting? (y/N) ');
          if (!proceed) {
            console.log('Aborted. Run `flake-monster restore` manually to clean up.');
            process.exit(1);
          }
          await engine.restoreAll(projectRoot, existingManifest);
          await Manifest.delete(flakeDirCheck);
          console.log('Previous injections removed. Proceeding with fresh injection.\n');
        }

        const useWorkspace = options.workspace;
        let targetDir = projectRoot;
        let workspace = null;

        if (useWorkspace) {
          workspace = new ProjectWorkspace({ sourceDir: projectRoot, runId: `inject-seed-${seed}` });
          await workspace.create();
          targetDir = workspace.root;
          console.log(`Workspace created: ${workspace.root}`);
        }

        const manifest = await engine.injectAll(targetDir, globs, seed, merged.exclude);
        const flakeDir = getFlakeMonsterDir(useWorkspace ? targetDir : projectRoot);
        await manifest.save(flakeDir);

        const totalFiles = Object.keys(manifest.getFiles()).length;
        const totalInjections = manifest.getTotalInjections();

        console.log(`\nInjected ${totalInjections} delays into ${totalFiles} file(s)`);
        console.log(`Mode: ${profile.mode} | Seed: ${seed}`);

        if (useWorkspace) {
          console.log(`\nWorkspace: ${workspace.root}`);
          console.log('Run your tests against the workspace, then clean up with:');
          console.log(`  flake-monster restore`);
        }
      } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      }
    });
}
