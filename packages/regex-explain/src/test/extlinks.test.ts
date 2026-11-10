import { expect } from "chai";
import { describe, it } from "mocha";
import { regex101Url } from "../extlinks";

describe("regex101Url", () => {
  it("should prefill the regex and flags in the JavaScript flavor", () => {
    // Act
    const url = regex101Url({ pattern: "a+b", flags: "gi" });

    // Assert
    expect(url).to.equal("https://regex101.com/?regex=a%2Bb&flags=gi&flavor=javascript");
  });

  it("should add the test string when there is one", () => {
    // Act
    const url = new URL(regex101Url({ pattern: "a", flags: "" }, "a b\nc&d"));

    // Assert
    expect(url.searchParams.get("testString")).to.equal("a b\nc&d");
  });

  it("should round-trip characters that a query string treats specially", () => {
    // Arrange
    const pattern = "(?<n>[+&=#% ])\\d";

    // Act
    const url = new URL(regex101Url({ pattern, flags: "" }));

    // Assert
    expect(url.searchParams.get("regex")).to.equal(pattern);
    expect(url.search).to.not.contain("+");
  });
});
