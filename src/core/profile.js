const VALID_MODES = ['light', 'medium', 'hardcore'];
const VALID_DISTRIBUTIONS = ['uniform'];

/**
 * FlakeProfile resolves mode settings and delay distribution config.
 * Passed to adapters as part of injection options.
 */
export class FlakeProfile {
  /**
   * @param {Object} options
   * @param {string} [options.mode='medium']
   * @param {number} [options.minDelayMs=0]
   * @param {number} [options.maxDelayMs=50]
   * @param {string} [options.distribution='uniform']
   * @param {boolean} [options.skipTryCatch=false]
   * @param {boolean} [options.skipGenerators=true]
   */
  constructor(options = {}) {
    this.mode = options.mode || 'medium';
    this.minDelayMs = options.minDelayMs ?? 0;
    this.maxDelayMs = options.maxDelayMs ?? 50;
    this.distribution = options.distribution || 'uniform';
    this.skipTryCatch = options.skipTryCatch ?? false;
    this.skipGenerators = options.skipGenerators ?? true;

    if (!VALID_MODES.includes(this.mode)) {
      throw new Error(`Invalid mode "${this.mode}". Must be one of: ${VALID_MODES.join(', ')}`);
    }
    if (!VALID_DISTRIBUTIONS.includes(this.distribution)) {
      throw new Error(`Invalid distribution "${this.distribution}". Must be one of: ${VALID_DISTRIBUTIONS.join(', ')}`);
    }
    if (this.minDelayMs < 0) throw new Error('minDelayMs must be >= 0');
    if (this.maxDelayMs < this.minDelayMs) throw new Error('maxDelayMs must be >= minDelayMs');
  }

  /**
   * Build the inject options object to pass to a language adapter.
   * @param {string} filePath - relative file path
   * @param {number} seed - integer seed for this run
   * @returns {Object}
   */
  toInjectOptions(filePath, seed) {
    return {
      filePath,
      mode: this.mode,
      seed,
      delayConfig: {
        minMs: this.minDelayMs,
        maxMs: this.maxDelayMs,
        distribution: this.distribution,
      },
      skipTryCatch: this.skipTryCatch,
      skipGenerators: this.skipGenerators,
    };
  }

  /**
   * Create a FlakeProfile from a merged config object.
   * @param {Object} config
   * @returns {FlakeProfile}
   */
  static fromConfig(config) {
    return new FlakeProfile({
      mode: config.mode,
      minDelayMs: config.minDelayMs,
      maxDelayMs: config.maxDelayMs,
      distribution: config.distribution,
      skipTryCatch: config.skipTryCatch,
      skipGenerators: config.skipGenerators,
    });
  }
}
