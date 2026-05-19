import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferOwnershipClass,
  likelyPeBacked,
  extractCopyrightYears,
  hasLegacyStackHints,
  hasFounderNarrativeSignals,
} from "../lib/ownershipClassify.js";

// ── likelyPeBacked ──────────────────────────────────────────────────────────

test("likelyPeBacked: peFirm implies true", () => {
  assert.ok(likelyPeBacked({ rawMetadata: { peFirm: "Vista Equity" } }, null, ""));
});

test("likelyPeBacked: PE-style acquirer name", () => {
  assert.ok(likelyPeBacked({}, "Summit Partners", ""));
  assert.ok(likelyPeBacked({}, "Riverstone Capital LLC", ""));
});

test("likelyPeBacked: strategic acquirer without corpus PE signal", () => {
  assert.ok(!likelyPeBacked({}, "Microsoft Corporation", ""));
  assert.ok(!likelyPeBacked({}, "Google LLC", ""));
});

test("likelyPeBacked: corpus private equity phrase", () => {
  assert.ok(likelyPeBacked({}, null, "the company was acquired in a private equity transaction"));
});

// ── inferOwnershipClass: PE Owned ───────────────────────────────────────────

test("inferOwnershipClass: peFirm → PE Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    rawMetadata: { peFirm: "Vista Equity" },
    homepageTextSample: "B2B software for logistics.",
  });
  assert.equal(r.ownership_class, "PE Owned");
  assert.ok(r.ownership_confidence >= 0.8);
});

test("inferOwnershipClass: dated PE-style acquirer → PE Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2016, acquirer: "Summit Partners", source: "web_snippet" }],
    homepageTextSample: "Operations software.",
  });
  assert.equal(r.ownership_class, "PE Owned");
});

test("inferOwnershipClass: recent PE acquisition → PE Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2022, acquirer: "Growth Equity Partners", source: "web_snippet" }],
    homepageTextSample: "Cloud platform.",
  });
  assert.equal(r.ownership_class, "PE Owned");
});

test("inferOwnershipClass: corpus PE phrase → PE Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "We are a proud portfolio company of a leading private equity firm.",
  });
  assert.equal(r.ownership_class, "PE Owned");
});

test("inferOwnershipClass: strategic (non-PE) acquisition → Unknown", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2019, acquirer: "Microsoft Corporation", source: "web_snippet" }],
    homepageTextSample: "Enterprise widgets.",
  });
  assert.equal(r.ownership_class, "Unknown");
});

// ── inferOwnershipClass: VC Backed ──────────────────────────────────────────

test("inferOwnershipClass: Series B funding mention → VC Backed", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    description: "Raised $12M in Series B funding from leading venture investors.",
  });
  assert.equal(r.ownership_class, "VC Backed");
});

test("inferOwnershipClass: venture-backed keyword → VC Backed", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "We are a venture-backed SaaS company.",
  });
  assert.equal(r.ownership_class, "VC Backed");
});

test("inferOwnershipClass: seed round → VC Backed", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "Completed our seed round in 2021.",
  });
  assert.equal(r.ownership_class, "VC Backed");
});

// ── inferOwnershipClass: Founder Operated ───────────────────────────────────

test("inferOwnershipClass: founderStillOperating=true → Founder Operated", () => {
  const r = inferOwnershipClass({
    founderStillOperating: true,
    acquisitionHistory: [],
    homepageTextSample: "CEO John leads the company.",
  });
  assert.equal(r.ownership_class, "Founder Operated");
  assert.ok(r.ownership_confidence >= 0.7);
});

test("inferOwnershipClass: 'founder and CEO' in text → Founder Operated", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "Jane Smith, founder and CEO, drives our vision.",
  });
  assert.equal(r.ownership_class, "Founder Operated");
});

test("inferOwnershipClass: 'founder-led' keyword → Founder Operated", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "A founder-led team focused on customers.",
  });
  assert.equal(r.ownership_class, "Founder Operated");
});

test("inferOwnershipClass: PE Owned wins over founderStillOperating", () => {
  const r = inferOwnershipClass({
    founderStillOperating: true,
    acquisitionHistory: [{ year: 2016, acquirer: "Summit Partners", source: "web_snippet" }],
    homepageTextSample: "CEO John Smith leads the company.",
  });
  assert.equal(r.ownership_class, "PE Owned");
});

// ── inferOwnershipClass: Founder Owned ──────────────────────────────────────

test("inferOwnershipClass: bootstrapped keyword → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "We are a bootstrapped, profitable software company.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
});

test("inferOwnershipClass: privately held → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "A privately held company serving the construction industry.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
});

test("inferOwnershipClass: family-owned → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "A family-owned business with 30 years of experience.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
});

test("inferOwnershipClass: ESOP → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "We are an employee-owned company with an ESOP plan.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
});

// ── inferOwnershipClass: Unknown ────────────────────────────────────────────

test("inferOwnershipClass: no signals → Unknown", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "Software solutions for the logistics industry.",
  });
  assert.equal(r.ownership_class, "Unknown");
});

// ── extractCopyrightYears ────────────────────────────────────────────────────

test("extractCopyrightYears: span pattern © 1999 – 2014", () => {
  const { startYear, endYear } = extractCopyrightYears("© 1999 – 2014 acme corp");
  assert.equal(startYear, 1999);
  assert.equal(endYear, 2014);
});

test("extractCopyrightYears: single year © 2003", () => {
  const { startYear, endYear } = extractCopyrightYears("copyright 2003 acme");
  assert.equal(startYear, 2003);
  assert.equal(endYear, 2003);
});

test("extractCopyrightYears: copyright (c) span with em-dash", () => {
  const { startYear, endYear } = extractCopyrightYears("copyright (c) 2001—2018 company inc.");
  assert.equal(startYear, 2001);
  assert.equal(endYear, 2018);
});

test("extractCopyrightYears: no copyright text → nulls", () => {
  const { startYear, endYear } = extractCopyrightYears("we build great software");
  assert.equal(startYear, null);
  assert.equal(endYear, null);
});

// ── hasLegacyStackHints ──────────────────────────────────────────────────────

test("hasLegacyStackHints: .aspx in website URL", () => {
  assert.ok(hasLegacyStackHints({ website: "https://acme.com/default.aspx" }, ""));
});

test("hasLegacyStackHints: x-powered-by ASP.NET in techHints", () => {
  assert.ok(hasLegacyStackHints({ techHints: ["x-powered-by:ASP.NET"] }, ""));
});

test("hasLegacyStackHints: ColdFusion in corpus", () => {
  assert.ok(hasLegacyStackHints({}, "built on coldfusion enterprise"));
});

test("hasLegacyStackHints: PHP/5 in techHints", () => {
  assert.ok(hasLegacyStackHints({ techHints: ["x-powered-by:php/5.6"] }, ""));
});

test("hasLegacyStackHints: modern Next.js stack → false", () => {
  assert.ok(!hasLegacyStackHints({ techHints: ["Next.js", "React"] }, "modern saas platform"));
});

// ── hasFounderNarrativeSignals ───────────────────────────────────────────────

test("hasFounderNarrativeSignals: 'i founded' → originStory", () => {
  const { originStory } = hasFounderNarrativeSignals("back in 2004, i founded this company");
  assert.ok(originStory);
});

test("hasFounderNarrativeSignals: 'i still lead' → currentOperator", () => {
  const { currentOperator } = hasFounderNarrativeSignals("today i still lead a team of 30");
  assert.ok(currentOperator);
});

test("hasFounderNarrativeSignals: 'my team' → currentOperator", () => {
  const { currentOperator } = hasFounderNarrativeSignals("my team is dedicated to customer success");
  assert.ok(currentOperator);
});

test("hasFounderNarrativeSignals: bland marketing copy → neither", () => {
  const { originStory, currentOperator } = hasFounderNarrativeSignals(
    "we provide best-in-class solutions for enterprise clients",
  );
  assert.ok(!originStory);
  assert.ok(!currentOperator);
});

// ── Digital archaeology in inferOwnershipClass ───────────────────────────────

test("inferOwnershipClass: origin-story language alone → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "Back in 2001, I founded this company to solve a real problem.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
  assert.ok(r.ownership_confidence >= 0.40);
});

test("inferOwnershipClass: currentOperator language → Founder Operated", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    homepageTextSample: "Today I still lead a passionate team of engineers across three countries.",
  });
  assert.equal(r.ownership_class, "Founder Operated");
});

test("inferOwnershipClass: .aspx URL + old copyright → Founder Owned", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    website: "https://old-vendor.com/products.aspx",
    homepageTextSample: "© 2002 Old Vendor Inc. all rights reserved.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
  assert.ok(r.ownership_confidence >= 0.44);
});

test("inferOwnershipClass: legacy stack + origin story + old copyright → higher confidence", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    website: "https://legacy.com/home.aspx",
    techHints: ["x-powered-by:ASP.NET"],
    homepageTextSample:
      "© 1999–2010 Legacy Corp. I founded this business out of my garage in 1999.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
  assert.ok(r.ownership_confidence >= 0.50);
});

test("inferOwnershipClass: PE Owned overrides legacy-stack archaeology", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [{ year: 2018, acquirer: "Summit Capital Partners", source: "web_snippet" }],
    website: "https://old-vendor.com/default.aspx",
    homepageTextSample: "© 1997–2018 OldVendor. Leading provider of logistics software.",
  });
  assert.equal(r.ownership_class, "PE Owned");
});

test("inferOwnershipClass: bootstrapped + legacy stack → confidence boost", () => {
  const r = inferOwnershipClass({
    founderStillOperating: "unknown",
    acquisitionHistory: [],
    website: "https://legacy.com/home.aspx",
    homepageTextSample: "A bootstrapped company. © 1998–2006 LegacyCo.",
  });
  assert.equal(r.ownership_class, "Founder Owned");
  assert.ok(r.ownership_confidence >= 0.60);
});
