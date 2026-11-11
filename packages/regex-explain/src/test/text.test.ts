import { expect } from "chai";
import { describe, it } from "mocha";
import { code, describeCodePoint, lowerFirst, splitCodeSpans, withArticle } from "../text";

describe("code", () => {
  [
    { text: "abc", expected: "`abc`" },
    { text: "a`b", expected: "``a`b``" },
    { text: "`", expected: "`` ` ``" },
    { text: " a ", expected: "`  a  `" },
    { text: " a\nb ", expected: "`  a\nb  `" },
    { text: "  ", expected: "`  `" },
    { text: "   ", expected: "`   `" },
    { text: "\na ", expected: "` \na  `" },
    { text: " \n ", expected: "` \n `" },
  ].forEach(({ text, expected }) => {
    it(`should wrap ${JSON.stringify(text)} as ${expected}`, () => {
      // Act & Assert
      expect(code(text)).to.equal(expected);
    });
  });
});

describe("describeCodePoint", () => {
  [
    { cp: 0x61, expected: "the character `a`" },
    { cp: 0x20, expected: "a space" },
    { cp: 0x09, expected: "a tab" },
    { cp: 0x200b, expected: "the character U+200B" },
    { cp: 0x1f600, expected: "the character `😀`" },
  ].forEach(({ cp, expected }) => {
    it(`should describe U+${cp.toString(16)}`, () => {
      // Act & Assert
      expect(describeCodePoint(cp)).to.equal(expected);
    });
  });
});

describe("lowerFirst", () => {
  it("should lowercase only the first character", () => {
    // Act & Assert
    expect(lowerFirst("Match ABC")).to.equal("match ABC");
  });
});

describe("withArticle", () => {
  [
    { noun: "letter", expected: "a letter" },
    { noun: "uppercase letter", expected: "an uppercase letter" },
    { noun: "ASCII character", expected: "an ASCII character" },
  ].forEach(({ noun, expected }) => {
    it(`should write "${expected}"`, () => {
      // Act & Assert
      expect(withArticle(noun)).to.equal(expected);
    });
  });
});

describe("splitCodeSpans", () => {
  [
    { text: "plain", expected: [{ text: "plain", code: false }] },
    {
      text: "Match `ab` then `c`",
      expected: [
        { text: "Match ", code: false },
        { text: "ab", code: true },
        { text: " then ", code: false },
        { text: "c", code: true },
      ],
    },
    { text: "``a`b``", expected: [{ text: "a`b", code: true }] },
    { text: "`` ` ``", expected: [{ text: "`", code: true }] },
    { text: "`  a  `", expected: [{ text: " a ", code: true }] },
    { text: "`   `", expected: [{ text: "   ", code: true }] },
    { text: "`unclosed", expected: [{ text: "`unclosed", code: false }] },
  ].forEach(({ text, expected }) => {
    it(`should split ${JSON.stringify(text)}`, () => {
      // Act & Assert
      expect(splitCodeSpans(text)).to.deep.equal(expected);
    });
  });

  [
    { text: "abc" },
    { text: "a`b" },
    { text: "`" },
    { text: " a " },
    { text: " a\nb " },
    { text: "  " },
    { text: "   " },
  ].forEach(({ text }) => {
    it(`should reverse code(${JSON.stringify(text)})`, () => {
      // Act & Assert
      expect(splitCodeSpans(code(text))).to.deep.equal([{ text, code: true }]);
    });
  });
});
