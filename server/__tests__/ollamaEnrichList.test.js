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

test("validateOllamaEnrichResult accepts employee foundedYear revenue and contact", () => {
  const out = validateOllamaEnrichResult(
    {
      employees: "51-200",
      foundedYear: 2008,
      revenue: "$5M",
      contactName: "Jane Roberts",
      role: "CEO",
      confidence: 0.72,
    },
    ["employee", "yearFounded", "estRevenue", "contactName"],
  );
  assert.ok(out);
  assert.equal(out.employees, "51-200");
  assert.equal(out.foundedYear, 2008);
  assert.equal(out.revenue, "$5M");
  assert.equal(out.contactName, "Jane Roberts");
});

test("validateOllamaEnrichResult rejects fake contact names", () => {
  const out = validateOllamaEnrichResult(
    {
      contactName: "Sales Team",
      role: "CEO",
      confidence: 0.9,
    },
    ["contactName"],
  );
  assert.equal(out, null);
});

test("mergeOllamaEnrichFields fills employee and yearFounded", () => {
  const merged = mergeOllamaEnrichFields(
    { employee: "", yearFounded: "", overview: "Existing" },
    { employees: "11-50", foundedYear: 2010, confidence: 0.8 },
    ["employee", "yearFounded"],
  );
  assert.equal(merged.employee, "11-50");
  assert.equal(merged.yearFounded, 2010);
  assert.equal(merged.overview, "Existing");
});

test("detectEnrichListFieldsNeeded with fillBlanksOnly skips populated input cells", () => {
  const inputRow = { Company: "Acme", Overview: "Existing overview", Ownership: "PE-Owned" };
  const ruleFields = {
    overview: "Skip to content nav junk",
    vertical: "",
    ownership: "Unknown",
    employee: "51-200",
    yearFounded: 2010,
    estRevenue: "$5M",
    contactName: "Jane Smith",
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
    employee: "51-200",
    yearFounded: 2012,
    estRevenue: "$10M",
    contactName: "John Smith",
    role: "CEO",
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
