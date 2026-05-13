import assert from "node:assert/strict";
import { test } from "node:test";
import { inferOwnershipClass, likelyPeBacked } from "../lib/ownershipClassify.js";

test("likelyPeBacked: peFirm implies true", () => {
  assert.ok(
    likelyPeBacked({ rawMetadata: { peFirm: "Vista Equity" } }, null, ""),
  );
});

test("likelyPeBacked: PE-style acquirer name", () => {
  assert.ok(likelyPeBacked({}, "Summit Partners", ""));
  assert.ok(likelyPeBacked({}, "Riverstone Capital LLC", ""));
});

test("likelyPeBacked: strategic acquirer without corpus PE", () => {
  assert.ok(!likelyPeBacked({}, "Microsoft Corporation", ""));
  assert.ok(!likelyPeBacked({}, "Google LLC", ""));
});

test("likelyPeBacked: corpus private equity", () => {
  assert.ok(likelyPeBacked({}, null, "the company was acquired in a private equity transaction"));
});

test("inferOwnershipClass: peFirm without year → Private Equity", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: null, acquirer: "Some Sponsor", source: "PE portfolio listing" }],
    rawMetadata: { peFirm: "Vista Equity" },
    homepageTextSample: "B2B software for logistics.",
  });
  assert.equal(r.ownership_class, "Private Equity");
  assert.ok(r.ownership_confidence >= 0.65);
});

test("inferOwnershipClass: dated PE-style acquirer → Vintage PE", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2016, acquirer: "Summit Partners", source: "web_snippet" }],
    homepageTextSample: "Operations software.",
  });
  assert.equal(r.ownership_class, "Vintage PE");
});

test("inferOwnershipClass: dated PE-style acquirer → Recent PE", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2021, acquirer: "Growth Equity Partners", source: "web_snippet" }],
    homepageTextSample: "Cloud platform.",
  });
  assert.equal(r.ownership_class, "Recent PE");
});

test("inferOwnershipClass: strategic acquisition year → Acquired", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [{ year: 2019, acquirer: "Microsoft Corporation", source: "web_snippet" }],
    homepageTextSample: "Enterprise widgets.",
  });
  assert.equal(r.ownership_class, "Acquired");
});

test("inferOwnershipClass: founder still operating wins", () => {
  const r = inferOwnershipClass({
    founderStillOperating: true,
    acquisitionHistory: [{ year: 2016, acquirer: "Summit Partners", source: "web_snippet" }],
    homepageTextSample: "CEO John Smith leads the company.",
  });
  assert.equal(r.ownership_class, "Founder-Operated");
});

test("inferOwnershipClass: public signals", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "We are a publicly traded company listed on the NASDAQ.",
  });
  assert.equal(r.ownership_class, "Publicly Traded");
});

test("inferOwnershipClass: VC-backed signals", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    description: "Raised $12M in series B funding from leading venture investors.",
  });
  assert.equal(r.ownership_class, "VC-Backed");
});

test("inferOwnershipClass: ESOP signals", () => {
  const r = inferOwnershipClass({
    founderStillOperating: false,
    acquisitionHistory: [],
    homepageTextSample: "We are an employee-owned company with an ESOP plan.",
  });
  assert.equal(r.ownership_class, "Employee-Owned (ESOP)");
});
