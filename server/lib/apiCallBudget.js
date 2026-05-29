import { breadthMultiplier } from "./breadth.js";

/**
 * Per-job API call budget (shared across V×P discovery passes).
 * @param {{ breadth?: string }} brief
 */
export function createApiCallBudgets(brief) {
  const m = breadthMultiplier(brief);
  const apolloMax = m === 4 ? 120 : m === 2 ? 80 : 40;
  const crunchbaseMax = m === 4 ? 100 : m === 2 ? 60 : 30;

  function makeBucket(max) {
    let used = 0;
    return {
      get remaining() {
        return Math.max(0, max - used);
      },
      /** @returns {boolean} true if call was allowed */
      tryConsume(n = 1) {
        if (used + n > max) return false;
        used += n;
        return true;
      },
    };
  }

  return {
    apollo: makeBucket(apolloMax),
    crunchbase: makeBucket(crunchbaseMax),
  };
}
