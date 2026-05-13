/**
 * Rule-based thesis scoring + ownership_class (no LLM).
 */

/** @param {string|null|undefined} s */
function employeeMidpoint(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase().replace(/,/g, "");
  if (t.includes("1,000+") || t.includes("1000+")) return 1500;
  if (t.includes("501") && t.includes("1,000")) return 750;
  if (t.includes("201") && t.includes("500")) return 350;
  if (t.includes("51") && t.includes("200")) return 125;
  if ((t.includes("15") && t.includes("100")) || t.includes("15-100")) return 57;
  if (t.includes("11") && t.includes("50")) return 30;
  if (t.includes("1") && t.includes("10")) return 5;
  const m = t.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (m) return (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2;
  const m2 = t.match(/(\d+)\s*\+/);
  if (m2) return parseInt(m2[1], 10) + 50;
  return null;
}

/** Rough revenue midpoint in millions USD for band labels */
function revenueMidpointMillions(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase();
  if (t.includes("200m+") || t.includes("$200m")) return 300;
  if (t.includes("50m") && t.includes("200m")) return 125;
  if (t.includes("20m") && t.includes("50m")) return 35;
  if (t.includes("5m") && t.includes("20m")) return 12;
  if ((t.includes("2m") && t.includes("10m")) || t.includes("$2m-$10m")) return 6;
  if (t.includes("1m") && t.includes("5m")) return 3;
  if (t.includes("< $1m") || t.includes("<$1m")) return 0.5;
  return null;
}

function headcountFromText(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const m =
    t.match(/\b(\d{1,5})\+?\s+employees?\b/i) ||
    t.match(/\bteam\s+of\s+(\d{1,5})\b/i) ||
    t.match(/\b(\d{1,5})\s+people\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n < 500000 ? n : null;
}

function ageScoreFromYear(y) {
  if (y == null || Number.isNaN(Number(y))) return 5;
  const year = Number(y);
  if (year >= 2017) return 0;
  if (year >= 2010) return 8;
  if (year >= 2000) return 12;
  return 15;
}

function employeeScoreFromCount(n) {
  if (n == null || Number.isNaN(n)) return 4;
  if (n < 15) return -10;
  if (n < 50) return 8;
  if (n <= 100) return 15;
  if (n <= 200) return 10;
  if (n <= 500) return 5;
  return 0;
}

function companyTypeBonusFor(t) {
  if (t === "software") return 10;
  if (t === "hybrid") return 3;
  if (t === "hardware") return -10;
  return 0;
}

function revenueScoreFromMillions(millions) {
  if (millions == null || Number.isNaN(millions)) return 4;
  if (millions >= 2 && millions <= 10) return 10;
  if ((millions >= 1 && millions < 2) || (millions > 10 && millions <= 20)) return 6;
  return 2;
}

export function scoreThesis(enriched, brief) {
  const text = (
    (enriched.homepageTextSample || "") +
    " " +
    (enriched.braveSnippet || "")
  ).toLowerCase();

  const missionScore = Math.min(
    3,
    (enriched.missionCriticalKeywords || 0) + (text.match(/\b\d{2,4}\+?\s+customers?\b/) ? 1 : 0)
  );
  const verticalKeywords = (brief.selectedVerticals || []).map((v) => v.toLowerCase().split(/\s+/)[0]);
  let vertScore = 0;
  for (const vk of verticalKeywords) {
    if (vk && text.includes(vk)) vertScore += 1;
  }
  vertScore = Math.min(3, vertScore + (enriched.sourceTags?.some((s) => String(s).startsWith("Assoc:")) ? 1 : 0));

  const proprietaryStack = (enriched.ossSignals || 0) === 0;

  const acqYears = (enriched.acquisitionHistory || [])
    .map((a) => a.year)
    .filter((y) => typeof y === "number" && y > 1980 && y < 2030);
  const minAcq = acqYears.length ? Math.min(...acqYears) : null;

  let ownership_class = "Unknown";
  if (minAcq != null && minAcq < 2020) ownership_class = "Vintage PE";
  else if (minAcq != null && minAcq >= 2020) ownership_class = "Recent PE";
  if (enriched.founderStillOperating === true) ownership_class = "Founder-Operated";

  const ownershipMatch =
    ownership_class === "Vintage PE" || ownership_class === "Founder-Operated" ? 1 : 0;

  const empMid =
    employeeMidpoint(enriched.employees) ??
    headcountFromText(enriched.employeesText || "") ??
    headcountFromText(text.slice(0, 8000));
  const revMid = revenueMidpointMillions(enriched.revenue);
  const ageScore = ageScoreFromYear(enriched.foundedYear);
  const employeeScore = employeeScoreFromCount(empMid);
  const revenueScore = revenueScoreFromMillions(revMid);

  const companyTypeBonus = companyTypeBonusFor(enriched.companyType);

  let thesisScore = Math.round(
    ownershipMatch * 25 +
      (missionScore / 3) * 20 +
      (vertScore / 3) * 15 +
      (proprietaryStack ? 15 : 0) +
      ageScore +
      employeeScore +
      revenueScore +
      companyTypeBonus
  );
  thesisScore = Math.max(0, Math.min(100, thesisScore));

  const missionCritical = missionScore >= 2;
  const verticallyIntegrated = vertScore >= 1;

  return {
    ownership_class,
    thesisScore,
    ageScore,
    employeeScore,
    revenueScore,
    companyType: enriched.companyType ?? "unknown",
    companyTypeConfidence: enriched.companyTypeConfidence ?? 0,
    companyTypeBonus,
    missionCriticalRule: missionCritical,
    verticallyIntegratedRule: verticallyIntegrated,
    proprietaryStackRule: proprietaryStack,
    missionCriticalScore: missionScore,
    verticalIntegrationScore: vertScore,
    ownership_confidence: minAcq != null ? 0.75 : enriched.rawMetadata?.peFirm ? 0.65 : 0.35,
    missionCritical,
    verticallyIntegrated,
    proprietaryStack,
    classificationSource: "rule",
  };
}

export function applyManualOverrides(company, manual) {
  const m = { ...company };
  if (manual?.manual_mission_critical === "yes") m.missionCritical = true;
  if (manual?.manual_mission_critical === "no") m.missionCritical = false;
  if (manual?.manual_vertically_integrated === "yes") m.verticallyIntegrated = true;
  if (manual?.manual_vertically_integrated === "no") m.verticallyIntegrated = false;
  if (manual?.manual_proprietary === "yes") m.proprietaryStack = true;
  if (manual?.manual_proprietary === "no") m.proprietaryStack = false;
  const touched =
    manual?.manual_mission_critical === "yes" ||
    manual?.manual_mission_critical === "no" ||
    manual?.manual_vertically_integrated === "yes" ||
    manual?.manual_vertically_integrated === "no" ||
    manual?.manual_proprietary === "yes" ||
    manual?.manual_proprietary === "no";
  if (touched) m.classificationSource = "manual";
  return m;
}
