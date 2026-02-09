/**
 * Mulberry32 seeded PRNG.
 * Returns a function that produces floats in [0, 1) deterministically.
 * @param {number} seed - 32-bit integer seed
 * @returns {() => number}
 */
export function createRng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple string hash (DJB2). Returns an unsigned 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * Derive a sub-seed from a base seed + string context.
 * Each (file, function, index) combination gets a distinct but deterministic seed.
 * @param {number} baseSeed
 * @param {string} context - e.g. "src/user.js:loadUser:0"
 * @returns {number}
 */
export function deriveSeed(baseSeed, context) {
  return (baseSeed + hashString(context)) | 0;
}

/**
 * Generate a random seed when user passes --seed auto.
 * @returns {number}
 */
export function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff);
}

/**
 * Parse seed from CLI input. Returns a numeric seed.
 * @param {string|number} input - "auto" or a numeric string/number
 * @returns {number}
 */
export function parseSeed(input) {
  if (input === 'auto') return randomSeed();
  const n = Number(input);
  if (Number.isNaN(n)) throw new Error(`Invalid seed: ${input}`);
  return n | 0;
}
