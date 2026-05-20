import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PUBLIC_EXCLUSION_REASON,
  buildCorpusFromCompanyData,
  canRestoreRejectedRow,
  isPublicExcludedRow,
  isPublicExclusionData,
} from "../lib/publicExclusion.js";
import { passesPostMergeFilters } from "../lib/candidateDiscovery.js";

test("isPublicExclusionData and row guard", () => {
  assert.ok(isPublicExclusionData({ exclusionReason: PUBLIC_EXCLUSION_REASON }));
  assert.ok(
    isPublicExcludedRow({
      is_rejected: 1,
      data: JSON.stringify({ exclusionReason: PUBLIC_EXCLUSION_REASON }),
    }),
  );
  assert.ok(!canRestoreRejectedRow({ is_rejected: 1, data: '{"exclusionReason":"public_listing"}' }));
  assert.ok(canRestoreRejectedRow({ is_rejected: 1, data: '{"exclusionReason":"public_listing"}' }, true));
  assert.ok(canRestoreRejectedRow({ is_rejected: 1, data: "{}" }));
});

test("buildCorpusFromCompanyData merges text fields", () => {
  const corpus = buildCorpusFromCompanyData({
    homepageTextSample: "listed on the nasdaq",
    title: "Acme",
  });
  assert.ok(corpus.includes("nasdaq"));
});

test("passesPostMergeFilters excludes blocked public domain", () => {
  const exclude = new Set(["publicco.com"]);
  assert.ok(
    !passesPostMergeFilters({ website: "https://www.publicco.com", domain: "publicco.com" }, exclude),
  );
  assert.ok(passesPostMergeFilters({ website: "https://privateco.com" }, exclude));
});
