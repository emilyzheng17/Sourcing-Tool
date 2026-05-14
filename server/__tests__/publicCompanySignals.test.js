import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasAgencyConsultancyNoise,
  hasPublicListingSignals,
  shouldFastFailEnrichment,
} from "../lib/publicCompanySignals.js";

test("hasPublicListingSignals: nasdaq / publicly traded", () => {
  assert.ok(hasPublicListingSignals("listed on the nasdaq under ticker abcd"));
  assert.ok(hasPublicListingSignals("we are a publicly traded company"));
});

test("hasPublicListingSignals: IR + stock language", () => {
  assert.ok(
    hasPublicListingSignals(
      "investor relations quarterly results and stock performance for shareholders",
    ),
  );
});

test("hasPublicListingSignals: SEC / 10-K", () => {
  assert.ok(hasPublicListingSignals("filings available at sec.gov including our annual 10-k"));
});

test("hasPublicListingSignals: exchange ticker colon form", () => {
  assert.ok(hasPublicListingSignals("nyse: acme common stock overview"));
});

test("hasPublicListingSignals: negative — typical B2B SaaS blurb", () => {
  assert.ok(
    !hasPublicListingSignals(
      "enterprise saas platform for operations teams. request a demo. per-seat pricing. api and dashboard.",
    ),
  );
});

test("hasAgencyConsultancyNoise: agency labels", () => {
  assert.ok(hasAgencyConsultancyNoise("we are a full-service digital agency based in austin"));
});

test("hasAgencyConsultancyNoise: clients + consultancy", () => {
  assert.ok(
    hasAgencyConsultancyNoise(
      "our clients include fortune 500 brands. we are a technology consultancy focused on transformation.",
    ),
  );
});

test("hasAgencyConsultancyNoise: negative — product vendor", () => {
  assert.ok(
    !hasAgencyConsultancyNoise(
      "cloud erp for manufacturers. login to your dashboard. subscription pricing per user.",
    ),
  );
});

test("shouldFastFailEnrichment: short text never fires", () => {
  assert.ok(!shouldFastFailEnrichment("nasdaq".repeat(5))); // length < 80
});

test("shouldFastFailEnrichment: combines public + agency", () => {
  const longPublic = "x".repeat(60) + " listed on the nyse and investor relations for shareholders";
  assert.ok(shouldFastFailEnrichment(longPublic));
  const longAgency = "x".repeat(60) + " award-winning marketing agency for global brands";
  assert.ok(shouldFastFailEnrichment(longAgency));
});
