/**
 * Deterministic name/description similarity (Dice coefficient on character bigrams).
 * No external deps; suitable for finding near-duplicate company names in the universe.
 */

const NAME_WEIGHT = 0.65;
const DESC_WEIGHT = 0.35;

export function normalizeForSimilarity(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigramDice(a, b) {
  const na = normalizeForSimilarity(a);
  const nb = normalizeForSimilarity(b);
  if (na.length < 2 && nb.length < 2) {
    if (na.length === 0 && nb.length === 0) return 1;
    if (na.length === 0 || nb.length === 0) return 0;
  }
  if (na.length < 2 || nb.length < 2) {
    return na === nb ? 1 : na.includes(nb) || nb.includes(na) ? 0.85 : 0;
  }
  const grams = (t) => {
    const out = new Map();
    for (let i = 0; i < t.length - 1; i++) {
      const g = t.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const ga = grams(na);
  const gb = grams(nb);
  let inter = 0;
  for (const [g, ca] of ga) {
    const cb = gb.get(g) || 0;
    inter += Math.min(ca, cb);
  }
  const ta = [...ga.values()].reduce((s, v) => s + v, 0);
  const tb = [...gb.values()].reduce((s, v) => s + v, 0);
  if (ta + tb === 0) return 0;
  return (2 * inter) / (ta + tb);
}

export function similarityScorePair(anchor, candidate) {
  const nScore = bigramDice(anchor.nameStr, candidate.nameStr);
  if (!anchor.descSlice && !candidate.descSlice) {
    return nScore;
  }
  const dScore = bigramDice(anchor.descSlice, candidate.descSlice);
  return NAME_WEIGHT * nScore + DESC_WEIGHT * dScore;
}

export function stubFromRow(row) {
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }
  const name = row.name || data.name || row.domain || "";
  const desc = (data.description || "").slice(0, 400);
  return {
    id: row.id,
    domain: row.domain,
    nameStr: name,
    descSlice: desc,
  };
}

export function findSimilarToAnchors(anchorStubs, candidateStubs, { minScore = 0.84, limit = 100 } = {}) {
  const anchorSet = new Set(anchorStubs.map((a) => a.id));
  const scored = [];
  for (const cand of candidateStubs) {
    if (anchorSet.has(cand.id)) continue;
    let best = 0;
    for (const a of anchorStubs) {
      const s = similarityScorePair(a, cand);
      if (s > best) best = s;
    }
    if (best >= minScore) {
      scored.push({ stub: cand, score: best });
    }
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, limit);
}
