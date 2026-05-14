import test from "node:test";
import assert from "node:assert/strict";
import { passesPostMergeFilters } from "../lib/candidateDiscovery.js";

test("passesPostMergeFilters rejects excluded domain", () => {
  const exclude = new Set(["acme.com"]);
  assert.equal(
    passesPostMergeFilters({ website: "https://www.acme.com/about" }, exclude),
    false,
  );
});

test("passesPostMergeFilters accepts listing host", () => {
  const exclude = new Set();
  assert.equal(
    passesPostMergeFilters({ website: "https://www.g2.com/products/foo" }, exclude),
    true,
  );
});
