import { expect } from "chai";
import { describe, it } from "mocha";
import * as path from "path";
import { RegexMatcher } from "../matcher";

/** This module compiled next to the tests, which is also the worker's entry point. */
const WORKER = path.join(__dirname, "..", "matcher.js");

/** A short time limit, so the timeout test is quick. */
const SHORT_TIMEOUT_MS = 300;

describe("RegexMatcher", () => {
  it("should return the worker's matches", async () => {
    // Arrange
    const matcher = new RegexMatcher(WORKER);

    // Act
    const response = await matcher.match({ pattern: "b+", flags: "", text: "abbc", limit: 10 });

    // Assert
    expect(response.matches.map((m) => m.text)).to.deep.equal(["bb"]);
  });

  it("should stop a regex that backtracks catastrophically", async () => {
    // Arrange
    const matcher = new RegexMatcher(WORKER, SHORT_TIMEOUT_MS);

    // Act
    const response = await matcher.match({
      pattern: "^(a+)+$",
      flags: "",
      text: `${"a".repeat(40)}!`,
      limit: 10,
    });

    // Assert
    expect(response).to.deep.equal({ matches: [], truncated: false, timedOut: true });
  });

  it("should report a worker that fails to start", async () => {
    // Arrange
    const matcher = new RegexMatcher(path.join(__dirname, "missing.js"));

    // Act
    const response = await matcher.match({ pattern: "a", flags: "", text: "a", limit: 10 });

    // Assert
    expect(response.error).to.match(/Cannot find module/);
  });
});
