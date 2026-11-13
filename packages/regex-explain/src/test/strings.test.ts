import { expect } from "chai";
import { describe, it } from "mocha";
import { decodeEscape, singleQuotedValue, splitDelimitedPattern, translateFlags } from "../strings";

describe("decodeEscape", () => {
  [
    { escape: "\\n", expected: "\n" },
    { escape: "\\t", expected: "\t" },
    { escape: "\\\\", expected: "\\" },
    { escape: '\\"', expected: '"' },
    { escape: "\\q", expected: "q" },
    { escape: "\\x41", expected: "A" },
    { escape: "\\x{1F600}", expected: "😀" },
    { escape: "\\u0041", expected: "A" },
    { escape: "\\u{41}", expected: "A" },
    { escape: "\\U0001F600", expected: "😀" },
    { escape: "\\101", expected: "A" },
    { escape: "\\0", expected: "\0" },
    { escape: "\\\n", expected: "" },
    { escape: "\\N{DASH}", expected: undefined },
    { escape: "\\a", expected: undefined },
    { escape: "\\u{110000}", expected: undefined },
  ].forEach(({ escape, expected }) => {
    it(`should decode ${JSON.stringify(escape)} as ${JSON.stringify(expected)}`, () => {
      // Act & Assert
      expect(decodeEscape(escape)).to.equal(expected);
    });
  });

  it("should prefer the language's own meaning of an escape", () => {
    // Act & Assert
    expect(decodeEscape("\\s", { s: " " })).to.equal(" ");
  });
});

describe("singleQuotedValue", () => {
  [
    { text: "'a\\\\b'", expected: "a\\b" },
    { text: "'it\\'s'", expected: "it's" },
    { text: "'\\d'", expected: "\\d" },
    { text: "%q(a\\)b\\(c)", expected: "a)b(c" },
    { text: "%q(\\')", expected: "\\'" },
    { text: "'", expected: undefined },
  ].forEach(({ text, expected }) => {
    it(`should read ${text} as ${JSON.stringify(expected)}`, () => {
      // Act & Assert
      expect(singleQuotedValue(text)).to.equal(expected);
    });
  });
});

describe("splitDelimitedPattern", () => {
  [
    { value: "/a+/i", expected: { pattern: "a+", flags: "i" } },
    { value: "#a/b#", expected: { pattern: "a/b", flags: "" } },
    { value: "{a{2}}x", expected: { pattern: "a{2}", flags: "x" } },
    { value: "(a)", expected: { pattern: "a", flags: "" } },
    { value: "abc", expected: undefined },
    { value: "/abc", expected: undefined },
    { value: "", expected: undefined },
  ].forEach(({ value, expected }) => {
    it(`should split ${JSON.stringify(value)}`, () => {
      // Act & Assert
      expect(splitDelimitedPattern(value)).to.deep.equal(expected);
    });
  });
});

describe("translateFlags", () => {
  const cases: { flags: string; map: Record<string, string>; expected: string }[] = [
    { flags: "mi", map: { m: "s" }, expected: "si" },
    { flags: "iu", map: { u: "" }, expected: "i" },
    { flags: "x", map: {}, expected: "x" },
  ];
  cases.forEach(({ flags, map, expected }) => {
    it(`should translate "${flags}" to "${expected}"`, () => {
      // Act & Assert
      expect(translateFlags(flags, map)).to.equal(expected);
    });
  });
});
