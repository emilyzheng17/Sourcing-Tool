import test from "node:test";
import assert from "node:assert/strict";
import { PE_FIRMS } from "../sources/peFirms.data.js";
import { ROLLUP_PAGES } from "../sources/rollupPages.data.js";
import { MARKETPLACE_PAGES } from "../sources/marketplacePages.data.js";
import { testParseSoftwareAdviceListings } from "../sources/softwareAdvice.js";
import { testParseSourceForgeListings } from "../sources/sourceforge.js";
import { testParseSlashdotListings } from "../sources/slashdot.js";
import { testParseSaaSHubListings } from "../sources/saashub.js";
import { testParseAlternativeToListings } from "../sources/alternativeTo.js";
import { extractMarketplaceLinks } from "../sources/marketplacePages.js";
import { pathsForProduct, SOFTWARE_ADVICE_PATHS } from "../lib/productCategoryPaths.js";

test("PE firm seed list includes planned expansion firms", () => {
  const ids = new Set(PE_FIRMS.map((f) => f.id));
  // original firms
  for (const id of ["vista", "hg", "ta-associates", "battery", "k1", "francisco", "permira"]) {
    assert.ok(ids.has(id), `missing PE firm seed: ${id}`);
  }
  // North America additions
  for (const id of ["clovis-point", "aldrich", "cove-hill", "sageview", "invictus", "accel", "bvp"]) {
    assert.ok(ids.has(id), `missing NA PE firm seed: ${id}`);
  }
  // Europe additions
  for (const id of ["fortino", "oxx", "bregal-milestone", "nordic-capital", "inflexion", "waterland", "bowmark"]) {
    assert.ok(ids.has(id), `missing EU PE firm seed: ${id}`);
  }
  // Nordic additions
  for (const id of ["viking-growth", "monterro", "vendep", "gro-capital", "verdane", "norvestor"]) {
    assert.ok(ids.has(id), `missing Nordic PE firm seed: ${id}`);
  }
  assert.ok(PE_FIRMS.length >= 100, `expected >= 100 PE firms, got ${PE_FIRMS.length}`);
});

test("rollup seed list includes planned holdco pages", () => {
  const ids = new Set(ROLLUP_PAGES.map((r) => r.id));
  // original holdcos
  for (const id of ["topicus", "everfield", "lumine", "modaxo", "vencora"]) {
    assert.ok(ids.has(id), `missing rollup seed: ${id}`);
  }
  // new Nordic/EU public acquirers
  for (const id of ["vitec-acquisitions", "addnode", "visma", "enghouse", "hawk-infinity"]) {
    assert.ok(ids.has(id), `missing new rollup seed: ${id}`);
  }
  // new CSI operating groups
  for (const id of ["csi-andromeda", "csi-alpha"]) {
    assert.ok(ids.has(id), `missing CSI rollup seed: ${id}`);
  }
});

test("marketplace seed list is non-empty", () => {
  assert.ok(MARKETPLACE_PAGES.length >= 5);
  assert.ok(MARKETPLACE_PAGES.every((p) => p.pageUrl && p.name));
});

test("pathsForProduct resolves active product slugs", () => {
  const paths = pathsForProduct(SOFTWARE_ADVICE_PATHS, "Field Service Management", "erp");
  assert.ok(paths.includes("field-service"));
});

test("Software Advice parser extracts profile links", () => {
  const html = `<a href="/field-service/servicetitan-profile/">ServiceTitan</a>`;
  const rows = testParseSoftwareAdviceListings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("servicetitan-profile"));
  assert.equal(rows[0].sourceTag, "SoftwareAdvice");
});

test("SourceForge parser extracts product links", () => {
  const html = `<a href="/software/product/FastBound/">FastBound</a>`;
  const rows = testParseSourceForgeListings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("/software/product/FastBound"));
});

test("Slashdot parser extracts product links", () => {
  const html = `<a href="/software/p/Jobber/">Jobber</a>`;
  const rows = testParseSlashdotListings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("/software/p/Jobber"));
});

test("SaaSHub parser extracts product slug links", () => {
  const html = `<a href="https://www.saashub.com/jobber">Jobber</a>`;
  const rows = testParseSaaSHubListings(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.saashub.com/jobber");
});

test("AlternativeTo parser extracts software about links", () => {
  const html = `<h2>Acme ERP</h2><a href="/software/acme-erp/about/">Acme ERP</a>`;
  const rows = testParseAlternativeToListings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("/software/acme-erp/about"));
});

test("marketplace link harvest skips marketplace host", () => {
  const html = `<a href="https://vendor.example.com/app">Vendor Co</a>
<a href="https://appsource.microsoft.com/foo">Internal</a>`;
  const rows = extractMarketplaceLinks(html, "https://appsource.microsoft.com/", "AppSource");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://vendor.example.com/app");
});
