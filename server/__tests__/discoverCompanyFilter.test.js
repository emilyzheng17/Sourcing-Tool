import assert from "node:assert/strict";
import { test } from "node:test";
import {
  companyOwnershipMatchesFilter,
  companyPassesDiscoverFilters,
} from "../../shared/discoverCompanyFilter.js";
import { VERTICAL_MATCH_THRESHOLD } from "../../shared/verticalFitConstants.js";

const baseCriteria = {
  textQuery: "",
  ownershipFilter: "Any Ownership",
  companyTypeFilter: "Any Type",
  revenueFilter: "Any Revenue",
  sizeFilter: "Any Size",
  foundedFilter: "Any Era",
  thesisRequireMissionCritical: false,
  thesisRequireVertIntegrated: false,
  thesisRequireProprietary: false,
  thesisRequireFounderVintage: false,
  minOwnershipConfidence: 0,
  allowedCountryCodes: [],
  selectedVerticals: [],
  selectedProducts: [],
  selectedTags: [],
  strictVerticalFit: false,
};

test("ideal revenue band matches midpoint", () => {
  const c = { revenue: "$2M-$10M (ideal)", is_rejected: false };
  assert.ok(
    companyPassesDiscoverFilters(c, { ...baseCriteria, revenueFilter: "$2M-$10M (ideal)" }),
  );
  const c2 = { revenue: "$50M-$200M", is_rejected: false };
  assert.ok(
    !companyPassesDiscoverFilters(c2, { ...baseCriteria, revenueFilter: "$2M-$10M (ideal)" }),
  );
});

test("ownership filter: new class names match directly", () => {
  for (const oc of ["Founder Owned", "Founder Operated", "VC Backed", "PE Owned"]) {
    const c = { ownership_class: oc, is_rejected: false };
    assert.ok(
      companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: oc }),
      `expected ${oc} to match its own filter`,
    );
    assert.ok(
      !companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Unknown" }),
      `expected ${oc} NOT to match Unknown filter`,
    );
  }
});

test("ownership filter: legacy PE class names map to PE Owned", () => {
  for (const oc of ["Vintage PE", "Recent PE", "Private Equity", "Acquired"]) {
    const c = { ownership_class: oc, is_rejected: false };
    assert.ok(
      companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "PE Owned" }),
      `expected legacy class ${oc} to match PE Owned filter`,
    );
  }
});

test("ownership filter: legacy VC-Backed maps to VC Backed", () => {
  const c = { ownership_class: "VC-Backed", is_rejected: false };
  assert.ok(companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "VC Backed" }));
  assert.ok(!companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "PE Owned" }));
});

test("ownership filter: legacy Founder-Operated maps to Founder Operated", () => {
  const c = { ownership_class: "Founder-Operated", is_rejected: false };
  assert.ok(companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Founder Operated" }));
  assert.ok(!companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Founder Owned" }));
});

test("ownership filter: legacy Family-Owned and ESOP map to Founder Owned", () => {
  for (const oc of ["Family-Owned", "Employee-Owned (ESOP)"]) {
    const c = { ownership_class: oc, is_rejected: false };
    assert.ok(
      companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Founder Owned" }),
      `expected ${oc} to map to Founder Owned`,
    );
  }
});

test("companyOwnershipMatchesFilter helper: canonical names", () => {
  assert.ok(companyOwnershipMatchesFilter("Founder Owned", "Founder Owned"));
  assert.ok(companyOwnershipMatchesFilter("Founder Operated", "Founder Operated"));
  assert.ok(companyOwnershipMatchesFilter("VC Backed", "VC Backed"));
  assert.ok(companyOwnershipMatchesFilter("PE Owned", "PE Owned"));
  assert.ok(!companyOwnershipMatchesFilter("VC Backed", "PE Owned"));
});

test("companyOwnershipMatchesFilter helper: legacy names normalise correctly", () => {
  assert.ok(companyOwnershipMatchesFilter("Vintage PE", "PE Owned"));
  assert.ok(companyOwnershipMatchesFilter("Recent PE", "PE Owned"));
  assert.ok(companyOwnershipMatchesFilter("Private Equity", "PE Owned"));
  assert.ok(companyOwnershipMatchesFilter("VC-Backed", "VC Backed"));
  assert.ok(companyOwnershipMatchesFilter("Founder-Operated", "Founder Operated"));
  assert.ok(!companyOwnershipMatchesFilter("VC-Backed", "PE Owned"));
});

test("verticals require label intersection or strict fit score", () => {
  const cMatch = { verticals: ["Bulk Materials"], is_rejected: false };
  assert.ok(
    companyPassesDiscoverFilters(cMatch, {
      ...baseCriteria,
      selectedVerticals: ["Bulk Materials"],
    }),
  );
  const cNoVertLow = { verticals: [], verticalFitScore: 20, is_rejected: false };
  assert.ok(
    !companyPassesDiscoverFilters(cNoVertLow, {
      ...baseCriteria,
      selectedVerticals: ["Bulk Materials"],
      strictVerticalFit: false,
    }),
  );
  assert.ok(
    !companyPassesDiscoverFilters(cNoVertLow, {
      ...baseCriteria,
      selectedVerticals: ["Bulk Materials"],
      strictVerticalFit: true,
    }),
  );
  const cNoVertHigh = { verticals: [], verticalFitScore: VERTICAL_MATCH_THRESHOLD, is_rejected: false };
  assert.ok(
    companyPassesDiscoverFilters(cNoVertHigh, {
      ...baseCriteria,
      selectedVerticals: ["Bulk Materials"],
      strictVerticalFit: true,
    }),
  );
});

test("excludeRejected drops rejected rows", () => {
  const c = { is_rejected: true };
  assert.ok(!companyPassesDiscoverFilters(c, { ...baseCriteria, excludeRejected: true }));
  assert.ok(companyPassesDiscoverFilters(c, { ...baseCriteria, excludeRejected: false }));
});

test("selected tags require overlap with company.tags snapshot", () => {
  const c = { tags: ["API-First"], is_rejected: false };
  assert.ok(
    companyPassesDiscoverFilters(c, { ...baseCriteria, selectedTags: ["API-First", "EDI"] }),
  );
  assert.ok(
    !companyPassesDiscoverFilters(c, { ...baseCriteria, selectedTags: ["Only Other"] }),
  );
});
