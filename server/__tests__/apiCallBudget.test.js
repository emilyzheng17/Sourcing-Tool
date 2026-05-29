import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createApiCallBudgets } from "../lib/apiCallBudget.js";

describe("createApiCallBudgets", () => {
  it("focused breadth caps Apollo at 40 and Crunchbase at 30", () => {
    const b = createApiCallBudgets({ breadth: "focused" });
    assert.equal(b.apollo.remaining, 40);
    assert.equal(b.crunchbase.remaining, 30);
    let n = 0;
    while (b.apollo.tryConsume(1)) n += 1;
    assert.equal(n, 40);
    assert.equal(b.apollo.tryConsume(1), false);
  });

  it("exhaustive breadth uses higher caps", () => {
    const b = createApiCallBudgets({ breadth: "exhaustive" });
    assert.equal(b.apollo.remaining, 120);
    assert.equal(b.crunchbase.remaining, 100);
  });
});
