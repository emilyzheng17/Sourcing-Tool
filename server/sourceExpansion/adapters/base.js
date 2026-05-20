/**
 * Base adapter interface for Source Expansion crawlers.
 *
 * Every adapter extends BaseAdapter and implements the crawl() async generator.
 * The orchestrator calls crawl(), which yields batches of raw candidates.
 * The orchestrator handles normalization, dedup, scoring, and DB persistence.
 */

/**
 * @typedef {object} CrawlBatch
 * @property {object[]} companies - Raw company objects (will be normalized by orchestrator)
 * @property {string|null} cursor - Pagination cursor for resume (null = done)
 * @property {boolean} done - Whether this adapter has no more pages
 */

export class BaseAdapter {
  /**
   * @param {object} config
   * @param {string} config.id - Unique adapter identifier (e.g. "uk-companies-house")
   * @param {string} config.name - Human-readable name
   * @param {1|2|3} config.tier - Source tier (1=highest value)
   * @param {"registry"|"marketplace"|"pe"|"ecosystem"|"search"} config.signalType
   */
  constructor({ id, name, tier, signalType }) {
    this.id = id;
    this.name = name;
    this.tier = tier;
    this.signalType = signalType;
  }

  /**
   * Async generator that yields batches of companies.
   * The orchestrator provides the frontier (cursor state) and options.
   *
   * @param {object} frontier - { getCursor, saveCursor } bound to this adapter
   * @param {object} options
   * @param {object} options.fetchOpts - { cache, jitterHostState }
   * @param {NodeJS.ProcessEnv} options.env
   * @param {number} [options.maxItems] - Stop after this many items
   * @param {number} [options.deadline] - Timestamp to stop at
   * @yields {CrawlBatch}
   */
  async *crawl(_frontier, _options) {
    throw new Error(`${this.id}: crawl() not implemented`);
  }

  /** Adapter metadata for registration/logging. */
  get meta() {
    return {
      id: this.id,
      name: this.name,
      tier: this.tier,
      signalType: this.signalType,
    };
  }
}
