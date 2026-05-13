import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProductFit, PRODUCT_MATCH_THRESHOLD } from "../lib/productFit.js";

const fleet = "Fleet & Asset Management";
const erp = "ERP & Operations";

test("fleet keywords on fleet corpus verify fleet product", () => {
  const corpus =
    "acme builds fleet management and telematics software for heavy equipment gps tracking and work orders";
  const r = evaluateProductFit([fleet], [fleet], corpus, "");
  assert.ok(r.verifiedProducts.includes(fleet));
  assert.ok(r.productFitScore >= PRODUCT_MATCH_THRESHOLD);
});

test("fleet discovery tag without fleet evidence is not verified", () => {
  const corpus =
    "cloud erp and financials procurement platform general ledger for enterprise";
  const r = evaluateProductFit([fleet], [fleet], corpus, "");
  assert.equal(r.verifiedProducts.length, 0);
  assert.ok(r.productFitScore < PRODUCT_MATCH_THRESHOLD);
});

test("empty selectedProducts scores all candidate tags (no selection narrowing)", () => {
  const corpus =
    "our cmms handles preventive maintenance work orders and downtime tracking for plants";
  const r = evaluateProductFit([], ["Maintenance Management (CMMS)"], corpus, "");
  assert.equal(r.verifiedProducts.length, 1);
  assert.ok(r.productFitScore >= PRODUCT_MATCH_THRESHOLD);
});

test("empty selection and empty candidates yields neutral fit score", () => {
  const r = evaluateProductFit([], [], "anything", "");
  assert.equal(r.productFitScore, 100);
  assert.equal(r.verifiedProducts.length, 0);
});

test("multi-product candidate keeps only corroborated categories", () => {
  const corpus =
    "fleet telematics platform with gps tracking route optimization for carriers";
  const r = evaluateProductFit(
    [fleet, erp],
    [fleet, erp],
    corpus,
    "",
  );
  assert.ok(r.verifiedProducts.includes(fleet));
  assert.ok(!r.verifiedProducts.includes(erp));
});

test("selected products narrow scoring to intersection with candidate tags", () => {
  const corpus = "general ledger accounts payable procurement inventory erp software";
  const r = evaluateProductFit([erp], [fleet, erp], corpus, "");
  assert.ok(r.verifiedProducts.includes(erp));
  assert.ok(!r.verifiedProducts.includes(fleet));
});
