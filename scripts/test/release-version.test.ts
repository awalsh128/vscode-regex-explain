import { expect } from "chai";
import { describe, it } from "mocha";
import * as sinon from "sinon";
import { analyzeCommits, changeType, commitReleaseType, nextReleaseType } from "../release-version";

describe("commitReleaseType", () => {
  [
    { message: "fix: handle empty classes", expected: "patch" },
    { message: "perf(explainer): cache char sets", expected: "patch" },
    { message: "feat: explain modifiers", expected: "minor" },
    { message: "feat!: rename explainRegex", expected: "major" },
    { message: "fix: x\n\nBREAKING CHANGE: removed y", expected: "major" },
    { message: "docs: reword README", expected: null },
    { message: "not conventional", expected: null },
  ].forEach(({ message, expected }) => {
    it(`should map ${JSON.stringify(message.split("\n")[0])} to ${expected}`, () => {
      // Act & Assert
      expect(commitReleaseType(message)).to.equal(expected);
    });
  });
});

describe("changeType", () => {
  it("should return the largest bump", () => {
    // Act & Assert
    expect(changeType(["docs: a", "fix: b", "feat: c"])).to.equal("minor");
  });

  it("should return null when nothing releases", () => {
    // Act & Assert
    expect(changeType(["docs: a", "ci: b"])).to.equal(null);
  });
});

describe("nextReleaseType", () => {
  [
    { change: "fix", last: "1.0.2", pre: true, expected: "minor" },
    { change: "feat", last: "1.1.0", pre: true, expected: "patch" },
    { change: null, last: "1.1.1", pre: false, expected: "minor" },
    { change: "patch", last: "1.2.0", pre: false, expected: "patch" },
    { change: "major", last: "1.2.0", pre: false, expected: "major" },
    { change: "minor", last: undefined, pre: false, expected: "minor" },
  ].forEach(({ change, last, pre, expected }) => {
    it(`should bump ${expected} after ${last} for a ${change} ${pre ? "pre-release" : "release"}`, () => {
      // Arrange
      const bump = change === "fix" ? "patch" : change === "feat" ? "minor" : change;

      // Act & Assert
      expect(nextReleaseType(bump as "patch" | "minor" | "major" | null, last, pre)).to.equal(
        expected
      );
    });
  });

  [
    { change: "minor", last: "1.2.0", pre: false, expected: /publish them as a pre-release/ },
    { change: "major", last: "1.2.0", pre: true, expected: /publish them as a release/ },
    { change: "patch", last: undefined, pre: true, expected: /Tag the last published version/ },
  ].forEach(({ change, last, pre, expected }) => {
    it(`should refuse a ${change} ${pre ? "pre-release" : "release"} after ${last}`, () => {
      // Act & Assert
      expect(() => nextReleaseType(change as "patch" | "minor" | "major", last, pre)).to.throw(
        expected
      );
    });
  });
});

describe("analyzeCommits", () => {
  it("should read VSCE_PRE_RELEASE and log the decision", async () => {
    // Arrange
    const logger = { log: sinon.stub() };
    const context = {
      commits: [{ message: "fix: a" }],
      lastRelease: { version: "1.0.0" },
      env: { VSCE_PRE_RELEASE: "true" },
      logger,
    };

    // Act
    const type = await analyzeCommits({}, context);

    // Assert
    expect(type).to.equal("minor");
    expect(logger.log.calledWithMatch(/publishing a pre-release with minor bump/)).to.equal(true);
  });
});
