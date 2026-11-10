import { expect } from "chai";
import { describe, it } from "mocha";
import * as api from "../index";

describe("index", () => {
  it("should export exactly the documented public functions", () => {
    // Act
    const exported = Object.keys(api).sort();

    // Assert
    expect(exported).to.deep.equal([
      "ExplanationRenderer",
      "GRAMMARS",
      "RegexFinder",
      "SUPPORTED_LANGUAGE_IDS",
      "describeCount",
      "describeMatches",
      "explainRegex",
      "findMatches",
      "findRegexAt",
      "isRegexSource",
      "parseRegexInput",
      "regex101Url",
    ]);
  });
});
