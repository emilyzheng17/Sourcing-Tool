/** Playwright gated by PLAYWRIGHT=1 — dynamic import so runtime works without playwright installed unless enabled. */

let browserSingleton = null;
/** @type {Promise<any | null> | null} */
let browserPromise = null;

async function getBrowser() {
  if (browserSingleton) return browserSingleton;
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        const { chromium } = await import("playwright");
        browserSingleton = await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        return browserSingleton;
      } catch {
        return null;
      }
    })();
  }
  const b = await browserPromise;
  return b;
}

let budgetUsed = 0;

/** Test hook */
export async function __resetPlaywrightForTests() {
  await closePlaywrightBrowser();
  browserPromise = null;
  budgetUsed = 0;
}

/**
 * Shutdown shared Chromium (optional, e.g. CLI exit).
 */
export async function closePlaywrightBrowser() {
  if (!browserSingleton) return;
  try {
    await browserSingleton.close();
  } catch {
    /* ignore */
  }
  browserSingleton = null;
}

const DEFAULT_HOSTS = new Set(["www.g2.com", "www.capterra.com", "www.getapp.com"]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} url
 * @param {{ allowedHosts?: Set<string> }} [gate]
 */
export async function tryPlaywrightFallback(url, gate = {}) {
  if (process.env.PLAYWRIGHT !== "1") return null;
  const budget = parseInt(process.env.PLAYWRIGHT_BUDGET || "12", 10) || 12;
  if (budgetUsed >= budget) return null;

  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }

  const allowed = gate.allowedHosts || DEFAULT_HOSTS;
  if (!(allowed instanceof Set)) throw new Error("allowedHosts must be Set");
  if (!allowed.has(host)) return null;

  budgetUsed += 1;
  try {
    const browser = await getBrowser();
    if (!browser) return null;
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (compatible; SourcingTool/1.0; +https://github.com/) Chromium fallback",
      locale: "en-US",
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => undefined);
    await sleep(1800);
    const text = await page.content();
    await ctx.close().catch(() => undefined);
    if (!text || text.length < 400) return null;
    return { text, ok: true };
  } catch {
    return null;
  }
}
