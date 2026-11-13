import { expect } from "chai";
import { describe, it } from "mocha";
import * as path from "path";
import { RegexMatcher } from "../matcher";

/** This module compiled next to the tests, which is also the worker's entry point. */
const WORKER = path.join(__dirname, "..", "matcher.js");

/** A short time limit, so the timeout test is quick. */
const SHORT_TIMEOUT_MS = 300;

/** A time limit far longer than cancelling takes. */
const LONG_TIMEOUT_MS = 10_000;

/** How long a request runs before the test cancels it. */
const CANCEL_AFTER_MS = 100;

/** A request that backtracks until it is stopped. */
const CATASTROPHIC = { pattern: "^(a+)+$", flags: "", text: `${"a".repeat(40)}!`, limit: 10 };

/**
 * Waits for a promise that should reject.
 *
 * @param promise The promise.
 *
 * @returns What it rejected with, or undefined if it resolved.
 */
function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error
  );
}

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

  it("should stop the worker when the request is cancelled", async () => {
    // Arrange
    const matcher = new RegexMatcher(WORKER, LONG_TIMEOUT_MS);
    const controller = new AbortController();
    const started = Date.now();
    const response = matcher.match(CATASTROPHIC, controller.signal);

    // Act
    setTimeout(() => controller.abort(), CANCEL_AFTER_MS);

    // Assert
    expect(await rejection(response)).to.have.property("name", "AbortError");
    expect(Date.now() - started).to.be.below(LONG_TIMEOUT_MS / 2);
  });

  it("should not start a request that is already cancelled", async () => {
    // Arrange
    const matcher = new RegexMatcher(path.join(__dirname, "missing.js"));

    // Act
    const response = matcher.match(CATASTROPHIC, AbortSignal.abort());

    // Assert
    expect(await rejection(response)).to.have.property("name", "AbortError");
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
