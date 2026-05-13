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

test("ownership filter exact match on ownership_class", () => {
  const c = { ownership_class: "Vintage PE", is_rejected: false };
  assert.ok(
    companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Vintage PE" }),
  );
  assert.ok(
    !companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Founder-Operated" }),
  );
});

test("Private Equity filter matches Vintage PE, Recent PE, and Private Equity", () => {
  for (const oc of ["Vintage PE", "Recent PE", "Private Equity"]) {
    const c = { ownership_class: oc, is_rejected: false };
    assert.ok(
      companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Private Equity" }),
      `expected ${oc} to match Private Equity filter`,
    );
  }
  const other = { ownership_class: "VC-Backed", is_rejected: false };
  assert.ok(
    !companyPassesDiscoverFilters(other, { ...baseCriteria, ownershipFilter: "Private Equity" }),
  );
});

test("companyOwnershipMatchesFilter helper", () => {
  assert.ok(companyOwnershipMatchesFilter("Vintage PE", "Private Equity"));
  assert.ok(companyOwnershipMatchesFilter("Recent PE", "Private Equity"));
  assert.ok(companyOwnershipMatchesFilter("Private Equity", "Private Equity"));
  assert.ok(!companyOwnershipMatchesFilter("VC-Backed", "Private Equity"));
  assert.ok(companyOwnershipMatchesFilter("VC-Backed", "VC-Backed"));
});

test("VC-Backed filter exact match", () => {
  const c = { ownership_class: "VC-Backed", is_rejected: false };
  assert.ok(companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "VC-Backed" }));
  assert.ok(!companyPassesDiscoverFilters(c, { ...baseCriteria, ownershipFilter: "Family-Owned" }));
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
