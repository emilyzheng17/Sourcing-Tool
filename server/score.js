/**
 * Rule-based thesis scoring + ownership_class (no LLM).
 */
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

  const thesisScore = Math.round(
    ownershipMatch * 30 +
    (missionScore / 3) * 30 +
    (vertScore / 3) * 25 +
    (proprietaryStack ? 15 : 0)
  );

  const missionCritical = missionScore >= 2;
  const verticallyIntegrated = vertScore >= 1;

  return {
    ownership_class,
    thesisScore,
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
