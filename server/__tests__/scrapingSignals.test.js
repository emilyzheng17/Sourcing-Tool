import test from "node:test";
import assert from "node:assert/strict";
import { extractOrganizationSignals } from "../lib/schemaOrgSignals.js";
import { isLikelyBlockedOrChallengeHtml } from "../lib/fetchHtml.js";
import { testParseG2Listings } from "../sources/g2.js";

test("schema.org Organization foundingDate + numberOfEmployees range", () => {
  const html = `<html><head></head><body><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Organization","name":"Acme","foundingDate":"1998-01-02","numberOfEmployees":{"@type":"QuantitativeValue","minValue":51,"maxValue":200}}
</script></body></html>`;
  const s = extractOrganizationSignals(html);
  assert.equal(s.foundedYear, 1998);
  assert.ok(String(s.employeesBand || "").includes("51"));
});

test("G2 listings parser extracts product anchors", () => {
  const html = `<html><body><a href="/products/widget-pro/reviews">Widget Pro\n</a></body></html>`;
  const rows = testParseG2Listings(html);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].website.includes("products/widget-pro"));
});

test("blocked HTML heuristic", () => {
  assert.equal(
    isLikelyBlockedOrChallengeHtml({
      ok: true,
      status: 200,
      text: `<html><head><title>Attention Required!</title></head></html>`,
    }),
    true
  );
});
