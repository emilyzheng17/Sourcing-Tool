/**
 * Rotate a fixed seed list so successive runs harvest a different window.
 *
 * Adapters slice the first N entries of static seed lists (PE firms, rollup pages).
 * Always starting at index 0 means the same companies are harvested every run and
 * the tail of the list is never reached at low breadth. Rotating the start index
 * cycles coverage across the whole list over multiple runs.
 *
 * Offset precedence:
 *   1. brief.seedOffset (number) — explicit caller control.
 *   2. UTC day index — rotates daily; deterministic within a day (cache-friendly).
 *
 * @template T
 * @param {T[]} list
 * @param {{ seedOffset?: number }} [brief]
 * @returns {T[]}
 */
export function rotateSeeds(list, brief = {}) {
  if (!Array.isArray(list) || list.length < 2) return list;
  const explicit = Number(brief?.seedOffset);
  const base = Number.isFinite(explicit) ? explicit : Math.floor(Date.now() / 86_400_000);
  const off = ((Math.trunc(base) % list.length) + list.length) % list.length;
  if (off === 0) return list;
  return [...list.slice(off), ...list.slice(0, off)];
}
