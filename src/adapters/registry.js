import { REQUIRED_ADAPTER_PROPERTIES } from './adapter-interface.js';

/**
 * Registry that maps file types to language adapters.
 * Used by the engine to route files to the correct adapter.
 */
export class AdapterRegistry {
  #adapters = new Map();

  /**
   * Register an adapter. Validates it implements the required contract.
   * @param {import('./adapter-interface.js').LanguageAdapter} adapter
   */
  register(adapter) {
    for (const prop of REQUIRED_ADAPTER_PROPERTIES) {
      if (!(prop in adapter)) {
        throw new Error(`Adapter "${adapter.id || '?'}" is missing required property: ${prop}`);
      }
    }
    if (typeof adapter.id !== 'string' || !adapter.id) {
      throw new Error('Adapter id must be a non-empty string');
    }
    if (!Array.isArray(adapter.fileExtensions) || adapter.fileExtensions.length === 0) {
      throw new Error(`Adapter "${adapter.id}" must have at least one fileExtension`);
    }
    this.#adapters.set(adapter.id, adapter);
  }

  /**
   * Find the adapter for a given file path.
   * Tries extension match first, then canHandle() for ambiguous cases.
   * @param {string} filePath
   * @returns {import('./adapter-interface.js').LanguageAdapter|null}
   */
  getAdapterForFile(filePath) {
    // Fast path: match by extension
    for (const adapter of this.#adapters.values()) {
      if (adapter.fileExtensions.some((ext) => filePath.endsWith(ext))) {
        return adapter;
      }
    }
    // Slow path: ask each adapter
    for (const adapter of this.#adapters.values()) {
      if (adapter.canHandle(filePath)) {
        return adapter;
      }
    }
    return null;
  }

  /**
   * Get adapter by ID.
   * @param {string} id
   * @returns {import('./adapter-interface.js').LanguageAdapter|null}
   */
  getAdapter(id) {
    return this.#adapters.get(id) || null;
  }

  /** List all registered adapter IDs. */
  list() {
    return [...this.#adapters.keys()];
  }
}
