import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeForSimilarity,
  similarityScorePair,
  findSimilarToAnchors,
} from "../lib/companySimilarity.js";

test("normalize strips punctuation and lowercases", () => {
  assert.equal(normalizeForSimilarity("  Acme, Inc.  "), "acme inc");
});

test("identical names score 1", () => {
  const a = { id: 1, nameStr: "Acme Logistics", descSlice: "" };
  const b = { id: 2, nameStr: "Acme Logistics", descSlice: "" };
  assert.equal(similarityScorePair(a, b), 1);
});

test("typo in name still high similarity", () => {
  const a = { id: 1, nameStr: "Acme Logistics", descSlice: "" };
  const b = { id: 2, nameStr: "Acme Logistix", descSlice: "" };
  const s = similarityScorePair(a, b);
  assert.ok(s > 0.75, `expected > 0.75, got ${s}`);
});

test("unrelated names score low", () => {
  const a = { id: 1, nameStr: "Oracle Corporation", descSlice: "" };
  const b = { id: 2, nameStr: "Joe Pizza Shop", descSlice: "" };
  const s = similarityScorePair(a, b);
  assert.ok(s < 0.5, `expected < 0.5, got ${s}`);
});

test("findSimilarToAnchors returns best matches above threshold", () => {
  const anchors = [{ id: 10, nameStr: "Beta Supply Co", descSlice: "" }];
  const candidates = [
    { id: 1, nameStr: "Beta Supply Co", descSlice: "" },
    { id: 2, nameStr: "Gamma Retail", descSlice: "" },
    { id: 3, nameStr: "Beta Supply Corp", descSlice: "" },
  ];
  const out = findSimilarToAnchors(anchors, candidates, { minScore: 0.7, limit: 10 });
  assert.ok(out.length >= 1);
  assert.ok(out.some((x) => x.stub.id === 1));
  assert.equal(out[0].stub.id, 1);
});
