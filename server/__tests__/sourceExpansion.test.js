import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeCandidate, normalizeBatch } from "../sourceExpansion/normalize.js";
import { computePriority, ENRICHMENT_THRESHOLD } from "../sourceExpansion/prioritizer.js";

const ADAPTER_META = { id: "test-adapter", tier: 1, signalType: "marketplace" };

describe("normalize", () => {
  it("normalizes a valid candidate", () => {
    const raw = {
      name: "Acme Software",
      website: "https://www.acme-software.com/products",
      sourceTag: "G2",
      description: "Enterprise SaaS platform",
      foundedYear: 2010,
    };
    const result = normalizeCandidate(raw, ADAPTER_META);
    assert.ok(result);
    assert.equal(result.domain, "acme-software.com");
    assert.equal(result.name, "Acme Software");
    assert.equal(result.website, "https://www.acme-software.com/products");
    assert.equal(result.foundedYear, 2010);
    assert.equal(result.sourceTier, 1);
    assert.equal(result.signalType, "marketplace");
  });

  it("returns null for missing website", () => {
    const result = normalizeCandidate({ name: "Test" }, ADAPTER_META);
    assert.equal(result, null);
  });

  it("returns null for blocked domains (non-marketplace)", () => {
    const result = normalizeCandidate(
      { name: "Google", website: "https://google.com" },
      ADAPTER_META,
    );
    assert.equal(result, null);
  });

  it("accepts marketplace listing URLs (g2.com)", () => {
    const raw = {
      name: "FleetSaaS",
      website: "https://www.g2.com/products/fleetsaas/reviews",
      sourceTag: "Marketplace:G2:fleet-management",
      rawMetadata: { g2Url: "https://www.g2.com/products/fleetsaas/reviews", category: "fleet-management" },
    };
    const result = normalizeCandidate(raw, ADAPTER_META);
    assert.ok(result, "Should accept g2.com listing URL");
    assert.ok(result.domain.includes("pending-enrichment.local"), `Domain should be synthetic, got: ${result.domain}`);
    assert.equal(result.rawMetadata.listingUrl, "https://www.g2.com/products/fleetsaas/reviews");
    assert.equal(result.rawMetadata.needsWebsiteResolution, true);
  });

  it("accepts marketplace listing URLs (capterra.com)", () => {
    const raw = {
      name: "AcctPro",
      website: "https://www.capterra.com/p/123456/acctpro",
      sourceTag: "Marketplace:Capterra:accounting",
    };
    const result = normalizeCandidate(raw, ADAPTER_META);
    assert.ok(result, "Should accept capterra.com listing URL");
    assert.ok(result.rawMetadata.needsWebsiteResolution);
    assert.ok(result.rawMetadata.listingUrl.includes("capterra.com"));
  });

  it("accepts registry detail URLs (data.brreg.no)", () => {
    const raw = {
      name: "Norsk Software AS",
      website: "https://data.brreg.no/enhetsregisteret/api/enheter/123456789",
      sourceTag: "Registry:NO-BRREG",
      rawMetadata: { organisasjonsnummer: "123456789", needsWebsiteResolution: true },
    };
    const result = normalizeCandidate(raw, ADAPTER_META);
    assert.ok(result, "Should accept registry URL");
    assert.ok(result.domain.includes("pending-enrichment.local"));
    assert.equal(result.rawMetadata.registryUrl, "https://data.brreg.no/enhetsregisteret/api/enheter/123456789");
    assert.equal(result.rawMetadata.needsWebsiteResolution, true);
  });

  it("accepts registry detail URLs (find-and-update.company-information.service.gov.uk)", () => {
    const raw = {
      name: "UK Tech Ltd",
      website: "https://find-and-update.company-information.service.gov.uk/company/12345678",
      sourceTag: "Registry:UK-CH",
      rawMetadata: { companyNumber: "12345678", needsWebsiteResolution: true },
    };
    const result = normalizeCandidate(raw, ADAPTER_META);
    assert.ok(result, "Should accept UK Companies House registry URL");
    assert.ok(result.rawMetadata.needsWebsiteResolution);
  });

  it("parses founded year from string", () => {
    const result = normalizeCandidate(
      { name: "Test", website: "https://test.com", foundedYear: "Founded in 2008" },
      ADAPTER_META,
    );
    assert.ok(result);
    assert.equal(result.foundedYear, 2008);
  });

  it("deduplicates batch by domain", () => {
    const batch = [
      { name: "Acme Corp", website: "https://example.com/page1", sourceTag: "G2" },
      { name: "Acme Inc", website: "https://example.com/page2", sourceTag: "Capterra" },
      { name: "Other Co", website: "https://other.com", sourceTag: "G2" },
    ];
    const results = normalizeBatch(batch, ADAPTER_META);
    assert.equal(results.length, 2);
    assert.equal(results[0].domain, "example.com");
    assert.equal(results[1].domain, "other.com");
  });

  it("deduplicates marketplace listings by slug", () => {
    const batch = [
      { name: "FleetSaaS", website: "https://www.g2.com/products/fleetsaas/reviews", sourceTag: "G2" },
      { name: "FleetSaaS Inc", website: "https://www.g2.com/products/fleetsaas/pricing", sourceTag: "G2" },
      { name: "Other Tool", website: "https://www.g2.com/products/other-tool/reviews", sourceTag: "G2" },
    ];
    const results = normalizeBatch(batch, ADAPTER_META);
    assert.ok(results.length >= 2, `Expected at least 2 unique listings, got ${results.length}`);
  });
});

describe("prioritizer", () => {
  it("assigns high score to Tier 1 PE source with SaaS signals", () => {
    const candidate = {
      name: "Fleet SaaS Corp",
      description: "Enterprise fleet management SaaS platform with workflow automation and compliance",
      sourceTier: 1,
      signalType: "pe",
      sourceTags: ["PE:Valsoft"],
      foundedYear: 2005,
      employees: "150",
    };
    const { priorityScore, reasons } = computePriority(candidate);
    assert.ok(priorityScore >= 60, `Expected >= 60, got ${priorityScore}: ${reasons.join(", ")}`);
  });

  it("assigns low score to agency/consulting", () => {
    const candidate = {
      name: "Digital Marketing Agency",
      description: "We are a creative agency and consulting firm",
      sourceTier: 3,
      signalType: "search",
      sourceTags: ["search"],
    };
    const { priorityScore } = computePriority(candidate);
    assert.ok(priorityScore < ENRICHMENT_THRESHOLD, `Expected < ${ENRICHMENT_THRESHOLD}, got ${priorityScore}`);
  });

  it("scores registry source with maturity bonus", () => {
    const candidate = {
      name: "Legacy Systems Ltd",
      description: "Industrial software for manufacturing",
      sourceTier: 1,
      signalType: "registry",
      sourceTags: ["Registry:UK-CH"],
      foundedYear: 1998,
      employees: "85",
    };
    const { priorityScore, reasons } = computePriority(candidate);
    assert.ok(priorityScore >= 40, `Expected >= 40, got ${priorityScore}: ${reasons.join(", ")}`);
  });

  it("penalizes public company filers (10-K / CIK)", () => {
    const candidate = {
      name: "BigCorp Inc",
      description: "enterprise software",
      sourceTier: 2,
      signalType: "registry",
      sourceTags: ["Registry:US-SEC"],
      rawMetadata: { formType: "10-K", cik: "0001234567", publicCompany: true },
    };
    const { priorityScore, reasons } = computePriority(candidate);
    const withoutPenalty = {
      ...candidate,
      rawMetadata: {},
    };
    const { priorityScore: baseScore } = computePriority(withoutPenalty);
    assert.ok(priorityScore < baseScore, `Public company score ${priorityScore} should be < base ${baseScore}`);
    assert.ok(reasons.some((r) => r.includes("public company")), "Should mention public company penalty");
  });

  it("gives multi-source corroboration bonus", () => {
    const single = {
      name: "Test Co", description: "software", sourceTier: 2, signalType: "marketplace",
      sourceTags: ["G2"],
    };
    const multi = {
      ...single,
      sourceTags: ["G2", "Capterra", "Shopify"],
    };
    const { priorityScore: s1 } = computePriority(single);
    const { priorityScore: s2 } = computePriority(multi);
    assert.ok(s2 > s1, `Multi-source ${s2} should exceed single-source ${s1}`);
  });

  it("clamps score to 0-100 range", () => {
    const candidate = {
      name: "x", description: "", sourceTier: 3, signalType: "search", sourceTags: ["s"],
    };
    const { priorityScore } = computePriority(candidate);
    assert.ok(priorityScore >= 0 && priorityScore <= 100);
  });
});
