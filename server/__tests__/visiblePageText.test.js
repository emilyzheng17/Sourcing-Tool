import test from "node:test";
import assert from "node:assert/strict";
import { visibleTextFromHtml, sanitizeScrapedPlainText } from "../lib/visiblePageText.js";

test("visibleTextFromHtml strips script/style text", () => {
  const html = `<html><body>
    <p>Real marketing copy here.</p>
    <script>document.body.classList.add("x"); (function(){})();</script>
    <style>.x{color:red}</style>
  </body></html>`;
  const t = visibleTextFromHtml(html);
  assert.ok(t.includes("Real marketing"));
  assert.ok(!t.includes("classList"));
  assert.ok(!t.includes("function"));
  assert.ok(!t.includes("color:red"));
});

test("sanitizeScrapedPlainText removes domain-prefixed JS snippet", () => {
  const raw =
    "www.arenasolutions.com: (function(){if(typeof NPSH!==\"undefined\"&&NPSH.isScrolled()){setTimeout(()=>{document.body.classList.remove(\"nitro-cover\")},1e3);";
  const t = sanitizeScrapedPlainText(raw);
  assert.ok(!t.includes("function"));
  assert.ok(!t.includes("NPSH"));
});
