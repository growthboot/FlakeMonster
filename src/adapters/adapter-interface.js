/**
 * Language Adapter Interface
 *
 * Every language adapter must export an object conforming to this shape.
 * The AdapterRegistry validates required methods at registration time.
 *
 * The engine only deals with source text (strings) and metadata objects.
 * All AST parsing, manipulation, and code generation is encapsulated
 * inside the adapter. This is what makes adding a new language possible
 * without touching the core.
 */

/**
 * @typedef {Object} InjectionPoint
 * @property {string} id       - Unique ID for this injection (short hex)
 * @property {string} fnName   - Name of the containing async function (or "<anonymous>", "<arrow>")
 * @property {number} index    - 0-based injection index within this function
 * @property {number} line     - 1-based line number in the ORIGINAL source
 * @property {number} column   - 0-based column in the ORIGINAL source
 */

/**
 * @typedef {Object} InjectionResult
 * @property {string} source           - The modified source code text
 * @property {InjectionPoint[]} points - Metadata for every injection made
 * @property {boolean} runtimeNeeded   - Whether the runtime import was added
 */

/**
 * @typedef {Object} RemovalResult
 * @property {string} source       - The cleaned source code text
 * @property {number} removedCount - How many injections were removed
 */

/**
 * @typedef {Object} RuntimeInfo
 * @property {string} runtimeSourcePath - Absolute path to the runtime source file
 * @property {string} importStatement   - The import/require statement to inject
 * @property {string} runtimeFileName   - Filename when copied to workspace
 */

/**
 * @typedef {Object} InjectOptions
 * @property {string} filePath        - Relative file path (for metadata in delay calls)
 * @property {string} mode            - "light" | "medium" | "hardcore"
 * @property {number} seed            - Integer seed for deterministic delay derivation
 * @property {Object} delayConfig     - { minMs, maxMs, distribution }
 * @property {boolean} skipTryCatch   - Whether to skip injection inside try/catch/finally
 * @property {boolean} skipGenerators - Whether to skip async generator functions
 */

/**
 * @typedef {Object} LanguageAdapter
 *
 * @property {string} id
 *   Unique identifier, e.g. "javascript", "python", "go".
 *
 * @property {string} displayName
 *   Human-readable name, e.g. "JavaScript (ESM)".
 *
 * @property {string[]} fileExtensions
 *   Extensions this adapter handles, e.g. [".js", ".mjs"].
 *
 * @property {(filePath: string) => boolean} canHandle
 *   Given a file path, return true if this adapter should process it.
 *
 * @property {(source: string, options: InjectOptions) => InjectionResult} inject
 *   Parse source text, inject delay statements, return modified source + metadata.
 *
 * @property {(source: string) => RemovalResult} remove
 *   Parse source text, remove all flake-monster injections, return cleaned source.
 *
 * @property {() => RuntimeInfo} getRuntimeInfo
 *   Returns info about the runtime file for this language.
 */

/** Required properties that every adapter must have. */
export const REQUIRED_ADAPTER_PROPERTIES = [
  'id',
  'displayName',
  'fileExtensions',
  'canHandle',
  'inject',
  'remove',
  'getRuntimeInfo',
];
