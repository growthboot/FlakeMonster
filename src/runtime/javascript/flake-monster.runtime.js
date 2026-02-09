// flake-monster.runtime.js
// Injected by FlakeMonster. DO NOT edit manually.
// This file is removed during restore.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export class __FlakeMonster__ {
  static #defaultMinMs = 0;
  static #defaultMaxMs = 50;

  /**
   * Deterministic async delay.
   * Derives a delay duration from (seed + file + fn + n) so the same
   * injection point always produces the same delay for a given seed.
   * @param {{ seed: number, file: string, fn: string, n: number, minMs?: number, maxMs?: number }} opts
   * @returns {Promise<void>}
   */
  static delay(opts) {
    const { seed, file, fn, n, minMs, maxMs } = opts;
    const contextSeed = (seed + hashString(`${file}:${fn}:${n}`)) | 0;
    const rng = mulberry32(contextSeed);
    const lo = minMs ?? __FlakeMonster__.#defaultMinMs;
    const hi = maxMs ?? __FlakeMonster__.#defaultMaxMs;
    const ms = lo + rng() * (hi - lo);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Override default delay range.
   * @param {{ minMs?: number, maxMs?: number }} config
   */
  static configure(config = {}) {
    if (config.minMs !== undefined) __FlakeMonster__.#defaultMinMs = config.minMs;
    if (config.maxMs !== undefined) __FlakeMonster__.#defaultMaxMs = config.maxMs;
  }
}
