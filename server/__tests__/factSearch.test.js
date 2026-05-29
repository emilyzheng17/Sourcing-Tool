import assert from "node:assert/strict";
import { test } from "node:test";
import { extractRevenueFromText, extractFoundedYearFromText, extractHeadcountFromText } from "../lib/companyTextExtract.js";
import { extractLeadershipFromText, pickLeadershipContact } from "../lib/leadershipExtract.js";
import { extractOrganizationSignals } from "../lib/schemaOrgSignals.js";

test("extractRevenueFromText parses dollar amounts near revenue", () => {
  assert.equal(
    extractRevenueFromText("Annual revenue of $12.5 million in 2024."),
    "$12.5 million",
  );
  assert.equal(
    extractRevenueFromText("The company reported $3.2M in annual sales last year."),
    "$3.2M",
  );
  assert.equal(extractRevenueFromText("We build software for contractors."), null);
});

test("extractFoundedYearFromText parses established year", () => {
  assert.equal(extractFoundedYearFromText("Established in 1998 in Texas."), 1998);
  assert.equal(extractFoundedYearFromText("Serving customers since 2012."), 2012);
});

test("extractHeadcountFromText parses staff counts", () => {
  assert.equal(extractHeadcountFromText("Sypro has 120 staff across offices."), 120);
});

test("extractLeadershipFromText finds CEO with expanded titles", () => {
  const people = extractLeadershipFromText(
    "Jane Roberts, Managing Director, leads the firm. John Smith is the Owner.",
  );
  assert.ok(people.some((p) => p.name === "Jane Roberts"));
  assert.ok(people.some((p) => p.name === "John Smith"));
  const pick = pickLeadershipContact(people);
  assert.ok(pick.contactName === "Jane Roberts" || pick.contactName === "John Smith");
});

test("extractOrganizationSignals extracts Person nodes from schema.org", () => {
  const html = `<html><head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "name": "Acme Corp",
          "foundingDate": "2005-03-01",
          "numberOfEmployees": 75,
          "founder": {
            "@type": "Person",
            "name": "Alice Johnson",
            "jobTitle": "CEO"
          }
        }
      ]
    }
    </script>
  </head><body></body></html>`;

  const signals = extractOrganizationSignals(html);
  assert.equal(signals.foundedYear, 2005);
  assert.equal(signals.employeesBand, "51-200");
  assert.ok(signals.people?.some((p) => p.name === "Alice Johnson" && p.title === "CEO"));
});
