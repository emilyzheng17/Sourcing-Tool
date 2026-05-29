import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateOllamaEnrichResult,
  ALLOWED_OWNERSHIP_VALUES,
} from "../providers/ollamaEnrichList.js";
import {
  detectEnrichListFieldsNeeded,
  mergeOllamaEnrichFields,
} from "../enrichByName.js";

test("validateOllamaEnrichResult accepts valid JSON and rejects bad vertical", () => {
  const ok = validateOllamaEnrichResult({
    overview: "Cloud dispatch platform for bulk materials haulers and producers.",
    vertical: "Bulk Materials",
    ownership: "VC-Backed",
    confidence: 0.82,
  });
  assert.ok(ok);
  assert.equal(ok.vertical, "Bulk Materials");
  assert.equal(ok.ownership, "VC-Backed");

  const badVert = validateOllamaEnrichResult({
    overview: "Software for mining operations.",
    vertical: "Not A Real Vertical",
    ownership: "FOFO",
    confidence: 0.9,
  });
  assert.ok(badVert);
  assert.equal(badVert.vertical, "");
  assert.equal(badVert.ownership, "FOFO");
});

test("validateOllamaEnrichResult rejects low confidence and junk overview", () => {
  assert.equal(
    validateOllamaEnrichResult({ overview: "Good product.", vertical: "", ownership: "Unknown", confidence: 0.2 }),
    null,
  );
  assert.equal(
    validateOllamaEnrichResult({
      overview: "Open Menu Close Menu Features Pricing",
      vertical: "Bulk Materials",
      ownership: "Unknown",
      confidence: 0.9,
    })?.overview,
    "",
  );
});

test("validateOllamaEnrichResult rejects invalid ownership", () => {
  const out = validateOllamaEnrichResult({
    overview: "Fleet management software.",
    vertical: "",
    ownership: "Family Owned",
    confidence: 0.7,
  });
  assert.ok(out);
  assert.equal(out.ownership, "");
});

test("detectEnrichListFieldsNeeded with fillBlanksOnly skips populated input cells", () => {
  const inputRow = { Company: "Acme", Overview: "Existing overview", Ownership: "PE-Owned" };
  const ruleFields = {
    overview: "Skip to content nav junk",
    vertical: "",
    ownership: "Unknown",
  };
  const needed = detectEnrichListFieldsNeeded(inputRow, ruleFields, true);
  assert.deepEqual(needed, ["vertical"]);
});

test("detectEnrichListFieldsNeeded without fillBlanksOnly includes weak rule fields", () => {
  const inputRow = { Company: "Acme", Overview: "Existing", Ownership: "PE-Owned" };
  const ruleFields = {
    overview: "Skip to content nav junk",
    vertical: "",
    ownership: "Unknown",
  };
  const needed = detectEnrichListFieldsNeeded(inputRow, ruleFields, false);
  assert.ok(needed.includes("overview"));
  assert.ok(needed.includes("vertical"));
  assert.ok(needed.includes("ownership"));
});

test("detectEnrichListFieldsNeeded returns empty when rules are strong", () => {
  const inputRow = { Company: "Tread" };
  const ruleFields = {
    overview: "Cloud platform for bulk construction materials haulers.",
    vertical: "Bulk Materials",
    ownership: "VC-Backed",
  };
  assert.deepEqual(detectEnrichListFieldsNeeded(inputRow, ruleFields, true), []);
});

test("mergeOllamaEnrichFields updates only requested fields", () => {
  const ruleFields = {
    website: "https://tread.io/",
    overview: "",
    vertical: "",
    ownership: "Unknown",
    country: "US",
  };
  const merged = mergeOllamaEnrichFields(
    ruleFields,
    {
      overview: "Dispatch and ticketing for bulk haulers.",
      vertical: "Bulk Materials",
      ownership: "VC-Backed",
      confidence: 0.8,
    },
    ["vertical", "ownership"],
  );
  assert.equal(merged.overview, "");
  assert.equal(merged.vertical, "Bulk Materials");
  assert.equal(merged.ownership, "VC-Backed");
  assert.equal(merged.website, "https://tread.io/");
});

test("ALLOWED_OWNERSHIP_VALUES matches spreadsheet export labels", () => {
  assert.ok(ALLOWED_OWNERSHIP_VALUES.has("FOFO"));
  assert.ok(ALLOWED_OWNERSHIP_VALUES.has("VC-Backed"));
  assert.ok(ALLOWED_OWNERSHIP_VALUES.has("Unknown"));
});
