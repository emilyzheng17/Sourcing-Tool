const NON_PERSON_WORDS =
  /\b(team|department|support|sales|marketing|company|staff|group|division|software|solutions|systems|technology|technologies|services|digital|cloud|management|instrument|instruments|lighting|scientific|control|chief|express|secure|meter|meters|works|consulting|industries|industrial|automation|platform|global|international|product|products|customer|customers|about|contact|home|login|menu|close|open|skip|content|features|pricing|learn|more|read|view|all|our|your|welcome|discover|explore|leading|premier|award|professional|enterprise|business|corporate|official|website|navigation|help|faq|docs|documentation|demo|trial|free|premium|standard|basic|custom|unique|exclusive|limited|unlimited|active|live|real|virtual|online|offline|remote|local|regional|national|market|sector|industry|vertical|segment|category|office|offices|hq|headquarters|branch|location|locations|facility|facilities|plant|factory|warehouse|store|shop|school|college|university|institute|academy|foundation|association|society|club|union|network|organization|organisation|institution|agency|bureau|committee|board|council|panel|unit|section|part|share|asset|fund|capital|investment|investor|shareholder|stakeholder|partner|founder|founders|owner|owners|president|ceo|cto|cfo|coo|director|directors|manager|managers|lead|heads|officer|officers|executive|executives|administrator|supervisor|coordinator|specialist|analyst|consultant|advisor|engineer|developers|designer|architect|scientist|researcher|technician|operator|technologist|programmer|coder|builder|creator|author|writer|editor|publisher|producer|actor|artist|musician|performer|speaker|presenter|host|guest|visitor|client|clients|patient|student|teacher|professor|instructor|trainer|coach|mentor|guide|leader|leaders|follower|subscriber|member|members|user|users|account|profile|person|people|human|individual|entity|entities|firm|firms|corporation|inc|llc|corp|ltd|plc|gmbh|holdings|ventures|venture|equity|private|public|listed|stock|merger|acquisition|acquired|subsidiary|parent|affiliate|brand|brands|trademark|patent|copyright|license|licence|permit|certification|compliance|regulation|standard|policy|procedure|process|system|platform|application|app|apps|hardware|firmware|middleware|database|server|servers|network|edge|mobile|web|desktop|native|hybrid|saas|paas|iaas|b2b|b2c|enterprise|smb|sme|startup|scaleup|unicorn|funding|raised|valuation|revenue|profit|loss|ebitda|margin|growth|scale|expansion|niche|taxonomy|schema|model|models|framework|methodology|approach|strategy|tactic|plan|goal|objective|mission|vision|values|purpose|today|tomorrow|yesterday|soon|later|early|late|fast|slow|quick|rapid|instant|immediate|async|sync|batch|stream|streaming|physical|analog|mixed|combined|integrated|unified|consolidated|aggregated|distributed|decentralized|centralized|federated|modular|monolithic|microservices|serverless|container|containers|kubernetes|docker)\b/i;

/** @param {string} name */
export function looksLikePersonName(name) {
  const n = String(name || "").trim();
  if (!n || n.length < 4) return false;
  if (NON_PERSON_WORDS.test(n)) return false;
  const parts = n.split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  if (parts.some((p) => /\d/.test(p) || p.length < 2)) return false;
  return parts.every((p) => /^[A-Z][a-z'-]+$/.test(p) || /^[A-Z]\.?$/.test(p));
}

/** @param {string} text */
export function extractHeadcountFromText(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const m =
    t.match(/\b(\d{1,5})\+?\s+employees?\b/i) ||
    t.match(/\bteam\s+of\s+(\d{1,5})\b/i) ||
    t.match(/\b(\d{1,5})\s+people\b/i) ||
    t.match(/\b(\d{1,5})\s+staff\b/i) ||
    t.match(/\bheadcount[:\s]+(\d{1,5})\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 && n < 500000 ? n : null;
}

/** @param {string} text */
export function extractFoundedYearFromText(text) {
  if (!text) return null;
  const patterns = [
    /\bfounded\s+(?:in\s+)?(?:\w+\s+)?(19\d{2}|20\d{2})\b/i,
    /\bestablished\s+(?:in\s+)?(?:\w+\s+)?(19\d{2}|20\d{2})\b/i,
    /\bsince\s+(19\d{2}|20\d{2})\b/i,
    /\bin\s+(19\d{2}|20\d{2})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1850 && y <= 2099) return y;
    }
  }
  return null;
}

/** @param {string} text */
export function extractRevenueFromText(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ");
  const patterns = [
    /\b(?:annual\s+)?revenue[^$]{0,30}(\$[\d,.]+\s*(?:million|billion|m|b|k)?)/i,
    /\b(?:sales|turnover)[^$]{0,30}(\$[\d,.]+\s*(?:million|billion|m|b|k)?)/i,
    /\b(\$[\d,.]+\s*(?:million|billion|m|b|k))\s+(?:in\s+)?(?:annual\s+)?(?:revenue|sales)/i,
    /\b(?:estimated\s+)?revenue\s+of\s+(\$[\d,.]+\s*(?:million|billion|m|b|k)?)/i,
    /\breported\s+(\$[\d,.]+\s*(?:million|billion|m|b|k))\s+in\s+annual\s+sales/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const val = m[1].trim();
      if (val.length >= 3 && val.length <= 40) return val;
    }
  }
  return null;
}

/** @param {number} n */
export function formatEmployeeBandFromCount(n) {
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1,000";
  return "1,000+";
}

export const EMPLOYEE_BAND_VALUES = new Set([
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1,000",
  "1,000+",
]);

/** @param {string} band */
export function isValidEmployeeBand(band) {
  const v = String(band || "").trim();
  if (!v) return false;
  if (EMPLOYEE_BAND_VALUES.has(v)) return true;
  if (/^\d{1,5}\+?$/.test(v)) return true;
  if (/^\d{1,5}-\d{1,6}$/.test(v)) return true;
  if (/^\d{1,3}(,\d{3})+$/.test(v)) return true;
  return false;
}

/** @param {string} revenue */
export function isValidRevenueString(revenue) {
  const v = String(revenue || "").trim();
  if (!v || v.length < 3 || v.length > 48) return false;
  return /\$[\d,.]+|\d[\d,.]*\s*(million|billion|m|b|k)\b/i.test(v);
}
