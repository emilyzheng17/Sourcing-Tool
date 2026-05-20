import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isHighTosSourcesEnabled } from "../lib/highTosEnv.js";

describe("isHighTosSourcesEnabled", () => {
  it("accepts 1, true, and yes (case insensitive)", () => {
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "1" }), true);
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "true" }), true);
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "TRUE" }), true);
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "yes" }), true);
  });

  it("rejects empty and other values", () => {
    assert.equal(isHighTosSourcesEnabled({}), false);
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "0" }), false);
    assert.equal(isHighTosSourcesEnabled({ ENABLE_HIGH_TOS_SOURCES: "false" }), false);
  });
});
