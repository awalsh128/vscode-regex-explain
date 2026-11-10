import { expect } from "chai";
import { describe, it } from "mocha";
import { findRegexAt, LocatedRegex, MAX_SCAN_LENGTH } from "../locator";
import { FINDER, findIn } from "./testing";

/** A regex at the start of a source, for lookups that only care about offsets. */
const REGEX: LocatedRegex = { pattern: "a", flags: "g", start: 4, end: 8 };

describe("RegexFinder", () => {
  it("should skip sources longer than the scan limit", async () => {
    // Arrange
    const source = `${"x".repeat(MAX_SCAN_LENGTH)}\nconst re = /a+/;`;

    // Act
    const found = await findIn(source, "typescript");

    // Assert
    expect(found).to.deep.equal([]);
  });

  it("should report offsets in UTF-16 code units after non-ASCII text", async () => {
    // Arrange
    const source = 'const é = "😀"; const re = /a+/;';

    // Act
    const [regex] = await FINDER.find(source, "typescript");

    // Assert
    expect({ start: regex.start, end: regex.end }).to.deep.equal({ start: 27, end: 31 });
  });

  [
    { name: "chained division", source: "const x = a / b / c;" },
    { name: "division after a call", source: "const x = f(a) / 2 / 3;" },
    { name: "a string", source: "const s = '/not/';" },
    { name: "a line comment", source: "x(); // /nor/" },
    { name: "a block comment over lines", source: "/*\n /no/\n*/ x();" },
    { name: "a template literal", source: "const t = `/no/ ${1}`;" },
  ].forEach(({ name, source }) => {
    it(`should ignore ${name}`, async () => {
      // Act
      const found = await findIn(source, "typescript");

      // Assert
      expect(found).to.deep.equal([]);
    });
  });

  [
    { name: "after return", source: "return /x+/.test(s);", pattern: "x+" },
    { name: "as a call argument", source: "s.replace(/\\s+/g, ' ');", pattern: "\\s+" },
    { name: "inside a template substitution", source: "`${/in/.source}`", pattern: "in" },
    { name: "on a later line", source: "const a = 1;\nconst b = /two/;", pattern: "two" },
  ].forEach(({ name, source, pattern }) => {
    it(`should find a literal ${name}`, async () => {
      // Act
      const [found] = await findIn(source, "typescript");

      // Assert
      expect(found.pattern).to.equal(pattern);
    });
  });

  it("should find nothing in a component without script blocks", async () => {
    // Act
    const found = await findIn("<template><p>/not/</p></template>", "vue");

    // Assert
    expect(found).to.deep.equal([]);
  });

  [
    { languageId: "typescript", expected: true },
    { languageId: "plaintext", expected: false },
  ].forEach(({ languageId, expected }) => {
    it(`should ${expected ? "" : "not "}support ${languageId}`, () => {
      // Act & Assert
      expect(FINDER.supports(languageId)).to.equal(expected);
    });
  });

  it("should find nothing in an unsupported language", async () => {
    // Act
    const found = await findIn("/a+/", "plaintext");

    // Assert
    expect(found).to.deep.equal([]);
  });
});

describe("findRegexAt", () => {
  [
    { offset: 3, expected: undefined },
    { offset: 4, expected: REGEX },
    { offset: 7, expected: REGEX },
    { offset: 8, expected: undefined },
  ].forEach(({ offset, expected }) => {
    it(`should ${expected ? "find" : "not find"} the regex at offset ${offset}`, () => {
      // Act & Assert
      expect(findRegexAt([REGEX], offset)).to.equal(expected);
    });
  });
});
