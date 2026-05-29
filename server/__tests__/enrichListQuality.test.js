import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedEnrichUrl, normalizeToSiteRoot, urlPathDepth } from "../lib/domains.js";
import {
  isJunkOverviewText,
  stripNavBoilerplate,
  extractSubstantiveParagraph,
  pickBestOverview,
} from "../lib/visiblePageText.js";
import { pickEnrichListVerticals, ENRICH_LIST_VERTICAL_MIN } from "../lib/verticalFit.js";
import {
  scoreDomainLookupResult,
  pickBestDomainLookupResult,
  deriveQualityTier,
  looksLikePersonName,
  extractHeadcountFromText,
  runEnrichListJob,
  QUALITY_GOLD_MIN,
  QUALITY_SILVER_MIN,
} from "../enrichByName.js";

const MIN_DOMAIN_LOOKUP_SCORE = 22;

test("isBlockedEnrichUrl rejects PDFs and social video pages", () => {
  assert.equal(isBlockedEnrichUrl("https://redwave.com/fileadmin/report.pdf"), true);
  assert.equal(isBlockedEnrichUrl("https://www.tiktok.com/@user/video/123"), true);
  assert.equal(isBlockedEnrichUrl("https://fennex.updatestar.com/en"), true);
  assert.equal(isBlockedEnrichUrl("https://firmatek.com/"), false);
});

test("normalizeToSiteRoot strips deep paths", () => {
  assert.equal(normalizeToSiteRoot("https://firmatek.com/about/team"), "https://firmatek.com/");
});

test("urlPathDepth counts segments", () => {
  assert.equal(urlPathDepth("https://example.com/"), 0);
  assert.equal(urlPathDepth("https://example.com/about"), 1);
  assert.equal(urlPathDepth("https://example.com/a/b/c"), 3);
});

test("scoreDomainLookupResult prefers homepage and name match", () => {
  const name = "Firmatek";
  const home = scoreDomainLookupResult(
    { url: "https://firmatek.com/", title: "Firmatek — mining software", snippet: "Firmatek solutions" },
    name,
  );
  const deep = scoreDomainLookupResult(
    { url: "https://trimble.com/en/products/b2w-software", title: "B2W Software", snippet: "Trimble B2W" },
    "B2W",
  );
  const tiktok = scoreDomainLookupResult(
    { url: "https://www.tiktok.com/@b2.baby/video/123", title: "sypro", snippet: "video" },
    "sypro",
  );

  assert.ok(home >= MIN_DOMAIN_LOOKUP_SCORE);
  assert.ok(home > deep);
  assert.equal(tiktok, -1);
});

test("pickBestDomainLookupResult rejects weak matches", () => {
  const picked = pickBestDomainLookupResult(
    [
      { url: "https://www.tiktok.com/@x/video/1", title: "sypro", snippet: "tiktok" },
      { url: "https://sr-rs.facebook.com/GoServicePro/", title: "Meta Careers", snippet: "jobs" },
    ],
    "sypro",
  );
  assert.equal(picked, null);
});

test("pickBestDomainLookupResult picks official homepage", () => {
  const picked = pickBestDomainLookupResult(
    [
      { url: "https://www.tread.io/", title: "Tread | Bulk Materials Dispatch", snippet: "Tread platform" },
      { url: "https://g2.com/products/tread", title: "Tread Reviews", snippet: "G2" },
    ],
    "Tread",
  );
  assert.ok(picked);
  assert.equal(picked.domain, "tread.io");
  assert.ok(picked.website.includes("tread.io"));
});

test("stripNavBoilerplate removes skip-to-content prefix", () => {
  const out = stripNavBoilerplate("Skip to content Products About Contact Cloud platform for bulk haulers.");
  assert.ok(!/^skip to content/i.test(out));
  assert.ok(out.includes("Cloud platform"));
});

test("isJunkOverviewText rejects PDF and menu junk", () => {
  assert.equal(isJunkOverviewText("%PDF-1.4 binary junk"), true);
  assert.equal(isJunkOverviewText("Open Menu Close Menu Features Pricing"), true);
  assert.equal(isJunkOverviewText("Cloud platform for bulk construction materials haulers and producers."), false);
});

test("pickBestOverview prefers meta description", () => {
  const out = pickBestOverview({
    name: "Tread",
    homepageMetaDescription: "Cloud platform unifying order management, dispatch, ticketing and billing for bulk construction materials haulers.",
    homepageTextSample: "Skip to content Home Products Login Cart Tread software platform…",
  });
  assert.ok(out.includes("Cloud platform"));
  assert.ok(!out.startsWith("Skip to content"));
});

test("extractSubstantiveParagraph skips nav-only text", () => {
  const para = extractSubstantiveParagraph(
    "Skip to content Home About Products Login All-in-one construction project management platform for builders.",
  );
  assert.ok(para.includes("construction project management"));
});

test("pickEnrichListVerticals returns top vertical above threshold", () => {
  const corpus =
    "saas platform for bulk material haulers sand and gravel crushed stone ready mix concrete asphalt dispatch ticketing billing logistics quarry producers";
  const verts = pickEnrichListVerticals("Tread", corpus, "");
  assert.ok(verts.length >= 1);
  assert.ok(verts.includes("Bulk Materials") || verts.includes("Contractor Solutions"));
  assert.ok(verts.length <= 2);
});

test("pickEnrichListVerticals mining name guard avoids false Metals & Mining", () => {
  const corpus = "digital mine air quality monitoring software platform for underground operations";
  const verts = pickEnrichListVerticals("Maestro Digital Mine", corpus, "");
  if (verts.includes("Metals & Mining")) {
    assert.fail("Should not match Metals & Mining from name alone without strong mining hints");
  }
});

test("pickEnrichListVerticals leaves blank when corpus is too weak", () => {
  const verts = pickEnrichListVerticals("Acme", "skip to content home login menu search", "");
  assert.deepEqual(verts, []);
});

test("ENRICH_LIST_VERTICAL_MIN is tuned for enrich-list recall", () => {
  assert.ok(ENRICH_LIST_VERTICAL_MIN >= 30);
  assert.ok(ENRICH_LIST_VERTICAL_MIN <= 40);
});

test("deriveQualityTier maps thesis score to Gold/Silver/Bronze", () => {
  assert.equal(deriveQualityTier(QUALITY_GOLD_MIN), "Gold");
  assert.equal(deriveQualityTier(QUALITY_GOLD_MIN + 5), "Gold");
  assert.equal(deriveQualityTier(QUALITY_SILVER_MIN), "Silver");
  assert.equal(deriveQualityTier(QUALITY_SILVER_MIN - 1), "Bronze");
  assert.equal(deriveQualityTier(0), "Bronze");
});

test("looksLikePersonName rejects departments and accepts real names", () => {
  assert.equal(looksLikePersonName("John Smith"), true);
  assert.equal(looksLikePersonName("Mary Jane Doe"), true);
  assert.equal(looksLikePersonName("Sales Team"), false);
  assert.equal(looksLikePersonName("Support"), false);
});

test("extractHeadcountFromText parses employee counts", () => {
  assert.equal(extractHeadcountFromText("We are a team of 85 people building software."), 85);
  assert.equal(extractHeadcountFromText("200+ employees worldwide"), 200);
  assert.equal(extractHeadcountFromText("no numbers here"), null);
});

test("runEnrichListJob ollama pass progress never exceeds total", async () => {
  const rows = [
    { Company: "Alpha", Overview: "", Vertical: "", Ownership: "" },
    { Company: "Beta", Overview: "Good overview text here.", Vertical: "Bulk Materials", Ownership: "FOFO" },
    { Company: "Gamma", Overview: "", Vertical: "", Ownership: "" },
  ];
  const events = [];

  await runEnrichListJob(
    rows,
    {},
    (evt) => events.push(evt),
    { useOllama: true, fillBlanksOnly: true },
    {
      enrichRowByName: async (row) => ({
        ...row,
        Website: "https://example.com",
        Overview: row.Company === "Beta" ? "Established SaaS platform." : "",
        Vertical: row.Company === "Beta" ? "Bulk Materials" : "",
        Ownership: row.Company === "Beta" ? "FOFO" : "Unknown",
      }),
      ollamaEnrichListGapFill: () => ({
        fill: async () => null,
      }),
    },
  );

  const progressEvents = events.filter((e) => e.type === "progress");
  const maxProcessed = Math.max(...progressEvents.map((e) => e.processed));
  const done = events.find((e) => e.type === "done");
  assert.ok(done);
  assert.equal(done.total, rows.length * 2);
  assert.equal(done.processed, rows.length * 2);
  assert.equal(maxProcessed, rows.length * 2);
  assert.ok(maxProcessed <= done.total);
});
