/**
 * Discovery breadth from UI brief: Focused (1x), Broad (2x), Exhaustive (4x).
 * @param {{ breadth?: string }} brief
 * @returns {1|2|4}
 */
export function breadthMultiplier(brief) {
  const b = String(brief?.breadth || "focused").toLowerCase();
  if (b === "exhaustive") return 4;
  if (b === "broad") return 2;
  return 1;
}
