/**
 * Evidence-based product fit vs discovery tags + UI product filters.
 * Mirrors verticalFit scoring shape.
 */

import { PORTFOLIO_PRODUCT_NAMES } from "./portfolioProductNames.js";
import { sanitizeCorpus } from "./verticalFit.js";

export const PRODUCT_MATCH_THRESHOLD = 38;
export const PRODUCT_FIT_WEAK_THRESHOLD = 40;

function preventiveMaintenanceHints() {
  return [
    "cmms",
    "computerized maintenance",
    "preventive maintenance",
    "preventative maintenance",
    "work order",
    "asset maintenance",
    "downtime tracking",
    "condition monitoring",
    "maintenance management",
    "plant maintenance",
    "parts inventory",
  ];
}

/** @type {Record<string, string[]>} */
export const PRODUCT_HINTS = {
  "ERP & Operations": [
    "erp",
    "enterprise resource planning",
    "financials",
    "general ledger",
    "procurement",
    "accounts payable",
    "accounts receivable",
    "inventory management",
    "multi-entity",
    "project accounting",
    "hr & payroll",
    "human capital management",
    "hcm ",
    "eprocurement",
    "netsuite",
    "sap ",
    "oracle ebs",
    "dynamics 365",
    "system of record",
  ],
  "Fleet & Asset Management": [
    "fleet management",
    "fleet ",
    "telematics",
    "gps tracking",
    "vehicle tracking",
    "asset lifecycle",
    "predictive maintenance",
    "fuel management",
    "work order",
    "work orders",
    "mixed fleet",
    "heavy equipment",
    "oem telematics",
    "fleet vehicles",
    "asset tracking",
  ],
  "Safety & Compliance Management": [
    "incident reporting",
    "incident management",
    "audit management",
    "permit-to-work",
    "permit to work",
    "risk assessment",
    "training tracking",
    "iso 45001",
    "osha",
    "safety compliance",
    "compliance management",
    "ehs software",
    "environmental health safety",
    "msha ",
  ],
  "Field Service Management": [
    "field service",
    "work order management",
    "scheduling & dispatch",
    "dispatch software",
    "technician scheduling",
    "mobile workforce",
    "customer portal",
    "field technician",
    "job site",
    "fsm ",
    "service management",
  ],
  "Estimating & Bidding": [
    "estimating software",
    "construction estimating",
    "digital takeoff",
    "takeoff software",
    "bid management",
    "bid templates",
    "cost database",
    "subcontractor management",
    "change orders",
    "estimating & bidding",
  ],
  "Supply Chain & Inventory": [
    "supply chain",
    "demand planning",
    "warehouse management",
    "wms ",
    "supplier portal",
    "materials tracking",
    "multi-location inventory",
    "inventory optimization",
    "procurement platform",
  ],
  "Dispatch & Logistics": [
    "dispatch software",
    "route optimization",
    "load planning",
    "carrier management",
    "real-time tracking",
    "real time tracking",
    "epod",
    "proof of delivery",
    "logistics software",
    "transportation management",
    "tms ",
  ],
  "Environmental & Waste Management": [
    "waste management software",
    "waste manifests",
    "recycling operations",
    "environmental reporting",
    "regulatory filings",
    "carbon tracking",
    "rcra",
    "iso 14001",
    "environmental compliance",
  ],
  "Structural & Engineering Design": [
    "structural analysis",
    "fea ",
    "finite element",
    "simulation software",
    "bim ",
    "cad integration",
    "engineering software",
    "structural engineering",
    "load calculations",
    "drawing management",
  ],
  "Project Management": [
    "project management software",
    "gantt",
    "resource planning",
    "budget tracking",
    "document control",
    "rfi ",
    "submittals",
    "construction project",
    "ppm software",
  ],
  "Maintenance Management (CMMS)": preventiveMaintenanceHints(),
  "Weighbridge & Ticketing": [
    "weighbridge",
    "truck scale",
    "scale software",
    "load ticket",
    "ticketing software",
    "material reconciliation",
    "belt scale",
    "scale integration",
    "quarry software",
  ],
  "CRM & Sales": [
    "crm software",
    "customer relationship",
    "pipeline management",
    "quoting software",
    "cpq ",
    "configure price quote",
    "account management",
    "sales automation",
    "b2b sales",
  ],
  "HR & Workforce Management": [
    "workforce management",
    "payroll software",
    "time & attendance",
    "time and attendance",
    "shift scheduling",
    "employee onboarding",
    "certification tracking",
    "hr software",
    "human resources software",
  ],
  "Business Intelligence & Reporting": [
    "business intelligence",
    "bi platform",
    "analytics dashboard",
    "kpi tracking",
    "data integration",
    "predictive analytics",
    "scheduled reports",
    "operational reporting",
    "data warehouse",
  ],
};

/** @type {Record<string, string[]>} */
const APOLLO_PRODUCT_HINTS = {
  "Fleet & Asset Management": ["fleet", "telematics", "transportation", "logistics software"],
  "ERP & Operations": ["erp", "enterprise software", "financial software"],
  "Safety & Compliance Management": ["ehs", "compliance", "environmental services", "risk management"],
  "Field Service Management": ["field service", "facilities services"],
  "CRM & Sales": ["crm", "sales", "computer software"],
  "HR & Workforce Management": ["human resources", "staffing", "recruiting"],
  "Business Intelligence & Reporting": ["business intelligence", "analytics", "data infrastructure"],
};

/**
 * @param {string} productLabel
 * @param {string} corpus
 * @param {string} apolloLower
 */
function scoreOneProduct(productLabel, corpus, apolloLower) {
  const hints = PRODUCT_HINTS[productLabel];
  if (!hints) return { score: 0, matchedHints: [] };

  const matchedHints = [];
  for (const h of hints) {
    if (corpus.includes(h)) matchedHints.push(h.trim());
  }

  let labelBoost = 0;
  const pl = productLabel.toLowerCase();
  if (corpus.includes(pl)) labelBoost += 28;
  else if (productLabel.includes("&")) {
    const parts = productLabel.split("&").map((s) => s.trim().toLowerCase());
    if (parts.every((p) => p.length > 2 && corpus.includes(p))) labelBoost += 22;
  }

  let apolloBoost = false;
  for (const a of APOLLO_PRODUCT_HINTS[productLabel] || []) {
    if (apolloLower.includes(a.trim().toLowerCase())) {
      apolloBoost = true;
      break;
    }
  }

  const hitScore = Math.min(72, matchedHints.length * 10);
  const apolloPts = apolloBoost ? 22 : 0;
  let raw = Math.min(100, hitScore + labelBoost + apolloPts);

  const softwareCue = ["software", "saas", "platform", "cloud ", "subscription", "enterprise "].some((x) =>
    corpus.includes(x),
  );
  if (softwareCue && matchedHints.length >= 1) {
    raw = Math.min(100, raw + 18);
  }

  raw = Math.round(raw);
  return { score: raw, matchedHints: [...new Set(matchedHints)] };
}

/**
 * @param {string[]|undefined} selectedProducts
 * @param {string[]|undefined} candidateProducts — tags from discovery merge
 * @param {string} corpusLower — from buildVerticalFitCorpus (already lower, spaced)
 * @param {string} [apolloIndustry]
 */
export function evaluateProductFit(selectedProducts, candidateProducts, corpusLower, apolloIndustry) {
  const corpus = typeof corpusLower === "string" ? corpusLower : sanitizeCorpus(corpusLower);
  const apolloLower = sanitizeCorpus(apolloIndustry || "");

  const candidates = [
    ...new Set((candidateProducts || []).filter((p) => PORTFOLIO_PRODUCT_NAMES.includes(String(p)))),
  ];
  const selected = [
    ...new Set((selectedProducts || []).filter((p) => PORTFOLIO_PRODUCT_NAMES.includes(String(p)))),
  ];

  const toScore = selected.length > 0 ? candidates.filter((p) => selected.includes(p)) : candidates;

  /** @type {Record<string, { score: number, matchedHints: string[] }>} */
  const productFitByProduct = {};
  /** @type {string[]} */
  const verifiedProducts = [];
  /** @type {string[]} */
  const reasons = [];
  let maxScore = 0;

  for (const p of toScore) {
    const r = scoreOneProduct(p, corpus, apolloLower);
    productFitByProduct[p] = r;
    if (r.score > maxScore) maxScore = r.score;
    if (r.score >= PRODUCT_MATCH_THRESHOLD) {
      verifiedProducts.push(p);
      const top = r.matchedHints.slice(0, 3).join(", ");
      reasons.push(top ? `${p}: ${top}` : `${p}: fit`);
    }
  }

  const unverifiedProducts = toScore.filter((p) => !verifiedProducts.includes(p));

  let productFitScore = maxScore;
  if (toScore.length === 0) {
    productFitScore = selected.length === 0 ? 100 : 0;
  }

  return {
    verifiedProducts,
    unverifiedProducts,
    productFitScore,
    productFitReasons: reasons.slice(0, 8),
    productFitByProduct,
  };
}

/**
 * Penalty when user selected products but homepage evidence for the tagged product is weak.
 * @param {number} productFitScore
 */
export function productFitThesisPenalty(productFitScore) {
  if (productFitScore >= PRODUCT_FIT_WEAK_THRESHOLD) return 0;
  return Math.min(12, Math.round((PRODUCT_FIT_WEAK_THRESHOLD - productFitScore) * 0.45));
}
