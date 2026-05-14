/**
 * Shared heuristics for “obviously public” copy and agency/consultancy homepages.
 * Used by enrich fast-fail and ownership classification — keep patterns aligned.
 * Tighten here first when tuning false positives.
 */

/**
 * @param {string} corpus — already lowercased
 * @returns {boolean}
 */
export function hasPublicListingSignals(corpus) {
  if (
    /\b(nasdaq|nyse|otcqx|otcqb|publicly traded|public company|listed on (the )?(new york|nasdaq)|stock ticker|ticker symbol|common stock|ordinary shares)\b/.test(
      corpus,
    ) ||
    /\b(ipo|initial public offering)\b/.test(corpus)
  ) {
    return true;
  }
  if (
    /\b(investor relations|ir contact|investors@|shareholder(s)?|annual report|proxy statement)\b/.test(
      corpus,
    ) &&
    /\b(stock|shares|securities|listing|listed|exchange)\b/.test(corpus)
  ) {
    return true;
  }
  if (/\bsec\.gov\b/.test(corpus) && /\b(filing|10-k|10-q|8-k|edgar)\b/.test(corpus)) return true;
  if (/\b10-k\b|\b10-q\b|\b8-k filing\b/.test(corpus)) return true;
  if (/\b(tsx|toronto stock exchange|lse|london stock exchange|euronext|xetra)\b/.test(corpus)) {
    if (/\b(listed|listing|ticker|shares|investor)\b/.test(corpus)) return true;
  }
  if (/\b(nyse|nasdaq|tsx):\s*[a-z]{1,5}\b/.test(corpus)) return true;
  if (/\b(stock symbol|trading symbol|ticker):\s*[a-z]{1,5}\b/.test(corpus)) return true;
  return false;
}

/**
 * Narrow agency / SI / “work for clients” positioning — avoid flagging product vendors.
 * @param {string} corpus — already lowercased
 */
export function hasAgencyConsultancyNoise(corpus) {
  if (/\b(digital agency|creative agency|marketing agency|advertising agency|branding agency)\b/.test(corpus))
    return true;
  if (/\b(staff augmentation|body shopping|nearshore (development )?team)\b/.test(corpus)) return true;
  if (
    /\b(our clients|clients we|client success stories|featured clients)\b/.test(corpus) &&
    /\b(consultancy|consulting firm|systems integrator|custom development|bespoke (software|solutions))\b/.test(
      corpus,
    )
  ) {
    return true;
  }
  if (
    /\b(management consulting|strategy consulting|technology consulting)\b/.test(corpus) &&
    /\b(case stud(y|ies)|our clients|client engagements)\b/.test(corpus)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {string} homepagePlainLower — sanitized visible homepage text, lowercased
 */
export function shouldFastFailEnrichment(homepagePlainLower) {
  if (!homepagePlainLower || homepagePlainLower.length < 80) return false;
  return (
    hasPublicListingSignals(homepagePlainLower) || hasAgencyConsultancyNoise(homepagePlainLower)
  );
}
