import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __sourcesDir = join(dirname(fileURLToPath(import.meta.url)), "../sources");
import { PE_FIRMS } from "../sources/peFirms.data.js";
import { ROLLUP_PAGES } from "../sources/rollupPages.data.js";
import { MARKETPLACE_PAGES } from "../sources/marketplacePages.data.js";
import { testParseSoftwareAdviceListings } from "../sources/softwareAdvice.js";
import { testParseSourceForgeListings } from "../sources/sourceforge.js";
import { testParseSlashdotListings } from "../sources/slashdot.js";
import { testParseSaaSHubListings } from "../sources/saashub.js";
import { testParseAlternativeToListings } from "../sources/alternativeTo.js";
import { testParseSaaSworthyListings } from "../sources/saasworthy.js";
import { testParseCrozdeskListings } from "../sources/crozdesk.js";
import { testParseYcCompanies } from "../sources/ycombinator.js";
import { testParseGithubOrgs } from "../sources/github.js";
import { testParseWordpressPlugins } from "../sources/wordpress.js";
import { buildListicleQueries } from "../sources/listicles.js";
import { collectSeeds, frontierQueries } from "../sources/frontier.js";
import { rotateSeeds } from "../lib/seedRotation.js";
import { extractMarketplaceLinks } from "../sources/marketplacePages.js";
import {
  findSubHubLinks,
  harvestPortfolioLikePage,
} from "../sources/portfolioHarvest.js";
import {
  testParseWikidataResults,
  ACQUIRER_PARENT_NAMES,
} from "../sources/wikidata.js";
import { pathsForProduct, SOFTWARE_ADVICE_PATHS } from "../lib/productCategoryPaths.js";
import { testParseSerperResults } from "../sources/serper.js";
import { testParseExaResults } from "../sources/exa.js";
import { testParseSearxResults } from "../sources/searxng.js";
import {
  testParseDuckDuckGoHtml,
  decodeDuckDuckGoHref,
} from "../sources/duckduckgo.js";

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

test("SaaSworthy parser extracts product profile links", () => {
  const html = `<a href="https://www.saasworthy.com/product/jobber">Jobber</a>
<a href="https://www.saasworthy.com/list/field-service-management-software">Category</a>`;
  const rows = testParseSaaSworthyListings(html);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.saasworthy.com/product/jobber");
  assert.equal(rows[0].sourceTag, "SaaSworthy");
});

test("Crozdesk parser extracts software profile links", () => {
  const html = `<a href="/software/acme-fsm">Acme FSM</a>
<a href="/software/acme-fsm/reviews">Reviews</a>`;
  const rows = testParseCrozdeskListings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("crozdesk.com/software/acme-fsm"));
  assert.equal(rows[0].sourceTag, "Crozdesk");
});

test("YCombinator parser maps company objects, skips public + non-company hosts", () => {
  const companies = [
    {
      name: "Acme Logistics SaaS",
      website: "https://www.acmelogistics.com/",
      status: "Active",
      one_liner: "Freight TMS for carriers.",
      tags: ["Logistics", "B2B"],
      batch: "W21",
    },
    { name: "Public Co", website: "https://www.publicco.com/", status: "Public" },
    { name: "Social", website: "https://www.linkedin.com/company/foo", status: "Active" },
    { name: "No site", website: "", status: "Active" },
  ];
  const rows = testParseYcCompanies(companies, "supply-chain-and-logistics");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.acmelogistics.com/");
  assert.equal(rows[0].sourceTag, "YCombinator");
  assert.equal(rows[0].rawMetadata.ycIndustry, "supply-chain-and-logistics");
});

test("GitHub parser maps org detail blog field to candidate, filters non-company hosts", () => {
  const details = [
    { login: "acmefsm", name: "Acme FSM", blog: "acmefsm.com", bio: "Field service software" },
    { login: "noblog", name: "No Blog", blog: "" },
    { login: "soc", name: "Social", blog: "https://twitter.com/acme" },
  ];
  const rows = testParseGithubOrgs(details);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://acmefsm.com");
  assert.equal(rows[0].sourceTag, "GitHub");
  assert.equal(rows[0].rawMetadata.githubLogin, "acmefsm");
});

test("WordPress parser maps plugin homepage, skips wp.org + missing homepages", () => {
  const plugins = [
    {
      name: "RentSyst &#8211; CRM for fleet management",
      slug: "rentsyst",
      homepage: "https://rentsyst.com/wp/",
      short_description: "Car rental & fleet software.",
      active_installs: 300,
    },
    { name: "Self-hosted", slug: "self", homepage: "https://wordpress.org/plugins/self/" },
    { name: "No homepage", slug: "none", homepage: "" },
    { name: "Social", slug: "soc", homepage: "https://www.facebook.com/foo" },
  ];
  const rows = testParseWordpressPlugins(plugins, "fleet management");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://rentsyst.com/wp/");
  assert.equal(rows[0].sourceTag, "WordPress");
  assert.equal(rows[0].name, "RentSyst – CRM for fleet management");
  assert.equal(rows[0].rawMetadata.wpQuery, "fleet management");
  assert.equal(rows[0].rawMetadata.wpSlug, "rentsyst");
});

test("buildListicleQueries templates best/top buyer-guide queries per vertical", () => {
  const queries = buildListicleQueries({
    selectedVerticals: ["Field Service Management"],
    activeProduct: "FSM",
  });
  assert.ok(queries.includes("best Field Service Management FSM software"));
  assert.ok(queries.includes("top Field Service Management software companies"));
  assert.ok(queries.every((q, i) => queries.indexOf(q) === i), "no duplicates");
});

test("collectSeeds normalizes seedCompanies strings/objects and dedupes", () => {
  const seeds = collectSeeds({
    seedCompanies: [
      "Jonas Software",
      { name: "ServiceTitan", website: "https://www.servicetitan.com/" },
      "https://www.acmefsm.com/",
      { company: "ServiceTitan", domain: "servicetitan.com" },
      "",
    ],
  });
  const labels = seeds.map((s) => (s.name || s.domain).toLowerCase());
  assert.ok(labels.includes("jonas software"));
  assert.ok(seeds.some((s) => s.domain === "servicetitan.com"));
  assert.ok(seeds.some((s) => s.domain === "acmefsm.com"));
  // "ServiceTitan" object + duplicate object collapse; empty string dropped.
  assert.equal(seeds.length, 3);
});

test("frontierQueries builds alternatives/competitors queries for a seed", () => {
  assert.deepEqual(frontierQueries({ name: "ServiceTitan", domain: "servicetitan.com" }), [
    "alternatives to ServiceTitan",
    "ServiceTitan competitors",
  ]);
  assert.deepEqual(frontierQueries({ name: "", domain: "" }), []);
});

test("rotateSeeds rotates start index by explicit offset and is stable", () => {
  const list = ["a", "b", "c", "d"];
  assert.deepEqual(rotateSeeds(list, { seedOffset: 0 }), ["a", "b", "c", "d"]);
  assert.deepEqual(rotateSeeds(list, { seedOffset: 1 }), ["b", "c", "d", "a"]);
  assert.deepEqual(rotateSeeds(list, { seedOffset: 5 }), ["b", "c", "d", "a"]);
  assert.deepEqual(rotateSeeds(list, { seedOffset: -1 }), ["d", "a", "b", "c"]);
  assert.deepEqual(rotateSeeds(["only"], { seedOffset: 3 }), ["only"]);
});

test("Serper parser extracts organic result links", () => {
  const data = {
    organic: [
      { link: "https://www.acmefleet.com/", title: "Acme Fleet Software", snippet: "Fleet management SaaS." },
      { link: "https://www.google.com/", title: "Google", snippet: "Search engine." },
    ],
  };
  const rows = testParseSerperResults(data);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.acmefleet.com/");
  assert.equal(rows[0].sourceTag, "Serper");
});

test("SearxNG parser extracts result links and filters junk domains", () => {
  const data = {
    results: [
      {
        url: "https://www.acmefleet.com/",
        title: "Acme Fleet Software",
        content: "Fleet management SaaS.",
      },
      { url: "https://www.google.com/", title: "Google", content: "Search engine." },
    ],
  };
  const rows = testParseSearxResults(data, "fleet software");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.acmefleet.com/");
  assert.equal(rows[0].sourceTag, "SearxNG");
  assert.equal(rows[0].rawMetadata.query, "fleet software");
});

test("decodeDuckDuckGoHref decodes uddg redirect links", () => {
  const href = "/l/?uddg=https%3A%2F%2Fwww.acmefleet.com%2F&rut=abc";
  assert.equal(decodeDuckDuckGoHref(href), "https://www.acmefleet.com/");
  assert.equal(decodeDuckDuckGoHref("https://vendor.example.com/"), "https://vendor.example.com/");
});

test("DuckDuckGo HTML parser extracts result links", () => {
  const html = `
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.acmefleet.com%2F">Acme Fleet Software</a>
    <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.google.com%2F">Google</a>
  `;
  const rows = testParseDuckDuckGoHtml(html, "fleet vendors");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.acmefleet.com/");
  assert.equal(rows[0].sourceTag, "DuckDuckGo");
  assert.equal(rows[0].rawMetadata.query, "fleet vendors");
});

test("testParseExaResults maps Exa API results to discovery candidates", () => {
  const data = {
    results: [
      {
        id: "exa-1",
        url: "https://www.acmefleet.com/products",
        title: "Acme Fleet Software",
      },
      {
        id: "exa-2",
        url: "https://www.facebook.com/acme",
        title: "Acme on Facebook",
      },
    ],
  };
  const rows = testParseExaResults(data, "fleet management software");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://www.acmefleet.com/products");
  assert.equal(rows[0].sourceTag, "Exa");
  assert.equal(rows[0].rawMetadata.exaQuery, "fleet management software");
});

test("marketplace link harvest skips marketplace host", () => {
  const html = `<a href="https://vendor.example.com/app">Vendor Co</a>
<a href="https://appsource.microsoft.com/foo">Internal</a>`;
  const rows = extractMarketplaceLinks(html, "https://appsource.microsoft.com/", "AppSource");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, "https://vendor.example.com/app");
});

test("raw fetch discovery sources use AbortSignal.timeout", () => {
  const searchApis = [
    "brave.js",
    "serper.js",
    "searxng.js",
    "duckduckgo.js",
    "exa.js",
    "tavily.js",
    "ycombinator.js",
    "github.js",
    "wordpress.js",
  ];
  const paginatedApis = ["apollo.js", "crunchbase.js"];
  for (const file of searchApis) {
    const src = readFileSync(join(__sourcesDir, file), "utf8");
    assert.match(src, /AbortSignal\.timeout\(20000\)/, `${file} should use 20s fetch timeout`);
  }
  for (const file of paginatedApis) {
    const src = readFileSync(join(__sourcesDir, file), "utf8");
    assert.match(src, /AbortSignal\.timeout\(25000\)/, `${file} should use 25s fetch timeout`);
  }
});

test("fanOutSources settle caps each source with Promise.race", () => {
  const indexSrc = readFileSync(join(__sourcesDir, "index.js"), "utf8");
  assert.match(indexSrc, /SOURCE_TIMEOUT_MS = 90_000/);
  assert.match(indexSrc, /__source_timeout__/);
  assert.match(indexSrc, /Promise\.race\(\[/);
});

test("findSubHubLinks picks same-domain hub paths and ignores externals/about pages", () => {
  const html = `
    <a href="/operating-groups">Operating Groups</a>
    <a href="https://acquirer.example.com/our-businesses/">Our Businesses</a>
    <a href="https://acquirer.example.com/companies?page=2">Browse Companies</a>
    <a href="https://other.example.com/portfolio">External</a>
    <a href="/about">About Us</a>
    <a href="/news/article">Press</a>
    <a href="/divisions/foo">Divisions Foo</a>
    <a href="/random">Operating Group</a>
  `;
  const links = findSubHubLinks(html, "https://acquirer.example.com/portfolio");
  assert.ok(links.includes("https://acquirer.example.com/operating-groups"));
  assert.ok(links.includes("https://acquirer.example.com/our-businesses/"));
  assert.ok(links.includes("https://acquirer.example.com/companies"));
  assert.ok(links.includes("https://acquirer.example.com/divisions/foo"));
  assert.ok(links.includes("https://acquirer.example.com/random"), "anchor text 'Operating Group' should match");
  assert.ok(!links.some((u) => u.includes("other.example.com")), "external host excluded");
  assert.ok(!links.some((u) => u.endsWith("/about")), "/about not a hub");
  assert.ok(!links.some((u) => u.includes("/news/")), "/news not a hub");
});

test("recursive harvestPortfolioLikePage follows one sub-hub level and dedupes", async () => {
  const root = "https://acquirer.example.com/portfolio";
  const sub = "https://acquirer.example.com/operating-groups";
  const cache = new Map();
  cache.set(root, {
    ok: true,
    status: 200,
    text: `
      <a href="/operating-groups">Operating Groups</a>
      <a href="https://shared.example.com/">Shared Co</a>
      <a href="https://co1.example.com/">Co One</a>
    `,
    url: root,
    headers: {},
  });
  cache.set(sub, {
    ok: true,
    status: 200,
    text: `
      <a href="https://co2.example.com/">Co Two</a>
      <a href="https://shared.example.com/">Shared Co (dup)</a>
      <a href="https://co3.example.com/">Co Three</a>
    `,
    url: sub,
    headers: {},
  });

  const out = await harvestPortfolioLikePage(
    root,
    "Acme Acquirer",
    "Rollup",
    "rollup",
    { cache },
    {},
    { crawlDepth: 1, pageBudget: 5 },
  );

  const domains = out.map((c) => c.website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  assert.deepEqual(domains.sort(), [
    "co1.example.com",
    "co2.example.com",
    "co3.example.com",
    "shared.example.com",
  ]);
  const co2 = out.find((c) => c.website.includes("co2.example.com"));
  assert.ok(co2.rawMetadata.viaSubHub === sub, "sub-hub provenance recorded");
  assert.ok(out.every((c) => c.sourceTag === "Rollup:Acme Acquirer"));
});

test("recursive harvest at crawlDepth=0 stays single-page (default behavior preserved)", async () => {
  const root = "https://acquirer.example.com/portfolio";
  const sub = "https://acquirer.example.com/operating-groups";
  const cache = new Map();
  cache.set(root, {
    ok: true,
    status: 200,
    text: `
      <a href="/operating-groups">Operating Groups</a>
      <a href="https://co1.example.com/">Co One</a>
    `,
    url: root,
    headers: {},
  });
  cache.set(sub, {
    ok: true,
    status: 200,
    text: `<a href="https://co2.example.com/">Co Two</a>`,
    url: sub,
    headers: {},
  });

  const out = await harvestPortfolioLikePage(
    root,
    "Acme Acquirer",
    "Rollup",
    "rollup",
    { cache },
    {},
  );
  const domains = out.map((c) => c.website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  assert.ok(domains.includes("co1.example.com"));
  assert.ok(!domains.includes("co2.example.com"), "sub-hub not followed when crawlDepth=0");
});

test("recursive harvestPortfolioLikePage recurses into nested sub-hubs at crawlDepth=2", async () => {
  const root = "https://holdco.example.com/portfolio";
  const group = "https://holdco.example.com/operating-groups";
  const subGroup = "https://holdco.example.com/divisions/unit";
  const cache = new Map();
  cache.set(root, {
    ok: true,
    status: 200,
    text: `
      <a href="/operating-groups">Operating Groups</a>
      <a href="https://co1.example.com/">Co One</a>
    `,
    url: root,
    headers: {},
  });
  cache.set(group, {
    ok: true,
    status: 200,
    text: `
      <a href="/divisions/unit">A Division</a>
      <a href="https://co2.example.com/">Co Two</a>
    `,
    url: group,
    headers: {},
  });
  cache.set(subGroup, {
    ok: true,
    status: 200,
    text: `<a href="https://co3.example.com/">Co Three</a>`,
    url: subGroup,
    headers: {},
  });

  const out = await harvestPortfolioLikePage(
    root,
    "Holdco",
    "Rollup",
    "rollup",
    { cache },
    {},
    { crawlDepth: 2, pageBudget: 10 },
  );
  const domains = out.map((c) => c.website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  assert.ok(domains.includes("co1.example.com"), "root level");
  assert.ok(domains.includes("co2.example.com"), "first sub-hub level");
  assert.ok(domains.includes("co3.example.com"), "second sub-hub level reached at depth=2");
});

test("recursive harvest respects pageBudget ceiling across nested levels", async () => {
  const root = "https://holdco.example.com/portfolio";
  const group = "https://holdco.example.com/operating-groups";
  const subGroup = "https://holdco.example.com/divisions/unit";
  const cache = new Map();
  cache.set(root, {
    ok: true,
    status: 200,
    text: `<a href="/operating-groups">Operating Groups</a><a href="https://co1.example.com/">Co One</a>`,
    url: root,
    headers: {},
  });
  cache.set(group, {
    ok: true,
    status: 200,
    text: `<a href="/divisions/unit">A Division</a><a href="https://co2.example.com/">Co Two</a>`,
    url: group,
    headers: {},
  });
  cache.set(subGroup, {
    ok: true,
    status: 200,
    text: `<a href="https://co3.example.com/">Co Three</a>`,
    url: subGroup,
    headers: {},
  });

  // pageBudget=2 → root + one sub-hub only; the deepest division is never fetched.
  const out = await harvestPortfolioLikePage(
    root,
    "Holdco",
    "Rollup",
    "rollup",
    { cache },
    {},
    { crawlDepth: 2, pageBudget: 2 },
  );
  const domains = out.map((c) => c.website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
  assert.ok(domains.includes("co1.example.com"));
  assert.ok(domains.includes("co2.example.com"));
  assert.ok(!domains.includes("co3.example.com"), "page budget halts before the deepest level");
});

test("Wikidata parser maps SPARQL JSON bindings, dedupes by domain, and drops blocked hosts", () => {
  const fixture = {
    results: {
      bindings: [
        {
          company: { value: "http://www.wikidata.org/entity/Q123" },
          companyLabel: { value: "Acme Software" },
          website: { value: "https://www.acmesoft.com/" },
          parent: { value: "http://www.wikidata.org/entity/Q1135126" },
          parentLabel: { value: "Constellation Software" },
        },
        {
          company: { value: "http://www.wikidata.org/entity/Q456" },
          companyLabel: { value: "Internal Brand" },
          website: { value: "https://www.linkedin.com/company/foo" },
          parentLabel: { value: "Constellation Software" },
        },
        {
          company: { value: "http://www.wikidata.org/entity/Q123" },
          companyLabel: { value: "Acme Software" },
          website: { value: "https://www.acmesoft.com/" },
          parentLabel: { value: "Topicus" },
        },
      ],
    },
  };
  const rows = testParseWikidataResults(fixture);
  assert.equal(rows.length, 1, "duplicate domain collapsed and blocked host dropped");
  assert.equal(rows[0].website, "https://www.acmesoft.com/");
  assert.equal(rows[0].sourceTag, "Wikidata:Constellation Software");
  assert.equal(rows[0].rawMetadata.parent, "Constellation Software");
  assert.equal(rows[0].rawMetadata.wikidataItem, "http://www.wikidata.org/entity/Q123");
});

test("Wikidata parser carries keyword context when no parent is set", () => {
  const fixture = {
    results: {
      bindings: [
        {
          company: { value: "http://www.wikidata.org/entity/Q789" },
          companyLabel: { value: "Forestry SaaS" },
          website: { value: "https://www.forestrysaas.com/" },
          description: { value: "Forestry management software" },
        },
      ],
    },
  };
  const rows = testParseWikidataResults(fixture, { keyword: "Forestry & Lumber" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceTag, "Wikidata");
  assert.equal(rows[0].rawMetadata.wikidataKeyword, "Forestry & Lumber");
  assert.equal(rows[0].rawMetadata.description, "Forestry management software");
});

test("rollup seed list now includes Valsoft sub-groups and Roper-class acquirers", () => {
  const ids = new Set(ROLLUP_PAGES.map((r) => r.id));
  for (const id of ["valsoft-asgard", "valsoft-allevia", "valsoft-trafera", "aspire-portfolio"]) {
    assert.ok(ids.has(id), `missing Valsoft sub-group seed: ${id}`);
  }
  for (const id of ["roper-businesses", "sylogist-products", "asseco-companies", "tyler-products", "trimble-businesses"]) {
    assert.ok(ids.has(id), `missing diversified-acquirer seed: ${id}`);
  }
});

test("rollup seed list includes newly added serial acquirers", () => {
  const ids = new Set(ROLLUP_PAGES.map((r) => r.id));
  for (const id of [
    "esw-capital",
    "aurea",
    "gfi-software",
    "eci-software",
    "saas-group",
    "sureswift",
    "dura-software",
    "tiny",
    "bending-spoons",
    "everfield-companies",
  ]) {
    assert.ok(ids.has(id), `missing newly added acquirer seed: ${id}`);
  }
  // Data shape preserved: every entry has id/name/pageUrl.
  assert.ok(ROLLUP_PAGES.every((r) => r.id && r.name && r.pageUrl));
});

test("sources/index.js registers the wikidata adapter", () => {
  const indexSrc = readFileSync(join(__sourcesDir, "index.js"), "utf8");
  assert.match(indexSrc, /from "\.\/wikidata\.js"/);
  assert.match(indexSrc, /settle\("wikidata",/);
});

test("sources/index.js registers the new discovery adapters", () => {
  const indexSrc = readFileSync(join(__sourcesDir, "index.js"), "utf8");
  for (const key of ["ycombinator", "github", "crozdesk", "saasworthy"]) {
    assert.match(indexSrc, new RegExp(`settle\\("${key}",`), `index.js should register ${key}`);
  }
  // Directory scrapers must be skippable on repeat passes like the other directories.
  assert.match(indexSrc, /"crozdesk",/);
  assert.match(indexSrc, /"saasworthy",/);
});

test("sources/index.js registers run-every-pass channels outside DIRECTORY_SOURCE_KEYS", () => {
  const indexSrc = readFileSync(join(__sourcesDir, "index.js"), "utf8");
  for (const key of ["wordpress", "listicles", "frontier"]) {
    assert.match(indexSrc, new RegExp(`settle\\("${key}",`), `index.js should register ${key}`);
  }
  // These run on every pass (registries/marketplace-APIs/frontier), so must NOT be
  // listed in DIRECTORY_SOURCE_KEYS where they'd be skipped on repeat passes.
  const dirBlock = indexSrc.slice(
    indexSrc.indexOf("DIRECTORY_SOURCE_KEYS"),
    indexSrc.indexOf("fanOutSourcesIncremental"),
  );
  for (const key of ["wordpress", "listicles", "frontier"]) {
    assert.ok(!new RegExp(`"${key}"`).test(dirBlock), `${key} must not be in DIRECTORY_SOURCE_KEYS`);
  }
});

test("ACQUIRER_PARENT_NAMES covers Valsoft and Constellation operating groups for SPARQL discovery", () => {
  const names = new Set(ACQUIRER_PARENT_NAMES.map((n) => n.toLowerCase()));
  for (const expected of [
    "valsoft corporation",
    "aspire software",
    "constellation software",
    "topicus.com",
    "lumine group",
    "vela software",
    "harris computer systems",
    "jonas software",
    "modaxo",
    "vencora",
    "everfield",
    "tyler technologies",
  ]) {
    assert.ok(names.has(expected), `ACQUIRER_PARENT_NAMES missing ${expected}`);
  }
  assert.ok(ACQUIRER_PARENT_NAMES.length >= 30, `expected >= 30 acquirer names, got ${ACQUIRER_PARENT_NAMES.length}`);
});

test("SearxNG caps respect SEARXNG_MAX_QUERIES / SEARXNG_MAX_RESULTS env overrides", () => {
  const src = readFileSync(join(__sourcesDir, "searxng.js"), "utf8");
  assert.match(src, /SEARXNG_MAX_QUERIES/);
  assert.match(src, /SEARXNG_MAX_RESULTS/);
  assert.match(src, /pLimit\(SEARXNG_QUERY_CONCURRENCY\)/);
});
