import { expect } from "chai";
import { describe, it } from "mocha";
import { describeCount, explainRegex, isRegexSource, parseRegexInput } from "../explainer";
import { explainValid, NO_FLAGS, outline } from "./testing";

describe("explainRegex", () => {
  describe("literals", () => {
    it("should merge consecutive characters into one step", () => {
      // Act
      const lines = outline("abc");

      // Assert
      expect(lines).to.deep.equal(["abc => Match the text `abc`"]);
    });

    it("should merge a long run of characters within the test timeout", () => {
      // Arrange
      const pattern = "a".repeat(50_000);

      // Act
      const lines = outline(pattern);

      // Assert
      expect(lines).to.deep.equal([`${pattern} => Match the text \`${pattern}\``]);
    });

    it("should keep characters on each side of another element as separate runs", () => {
      // Act
      const lines = outline("ab.cd");

      // Assert
      expect(lines).to.deep.equal([
        "ab => Match the text `ab`",
        ". => Match any character except a line break",
        "cd => Match the text `cd`",
      ]);
    });

    it("should name invisible characters", () => {
      // Act
      const lines = outline("\\t\\n");

      // Assert
      expect(lines).to.deep.equal(["\\t\\n => Match the sequence a tab, a line feed (newline)"]);
    });

    [
      { pattern: "@a", flags: "i", expected: "@a => Match the text `@a` (case-insensitive)" },
      { pattern: "@", flags: "i", expected: "@ => Match the character `@`" },
      { pattern: "[\\d.]", flags: "i", expected: "[\\d.] => Match one of:" },
      { pattern: "[\\da-z]", flags: "i", expected: "[\\da-z] => Match one of (case-insensitive):" },
    ].forEach(({ pattern, flags, expected }) => {
      it(`should note case-insensitivity only where it matters for /${pattern}/${flags}`, () => {
        // Act
        const [first] = outline(pattern, flags);

        // Assert
        expect(first).to.equal(expected);
      });
    });
  });

  describe("anchors and sets", () => {
    it("should explain anchors, character sets, and quantifiers in order", () => {
      // Act
      const lines = outline("^\\d+$");

      // Assert
      expect(lines).to.deep.equal([
        "^ => Assert position is at the start of the input",
        "\\d+ => Match a digit (0-9), one or more times (as many as possible)",
        "$ => Assert position is at the end of the input",
      ]);
    });

    [
      { flags: NO_FLAGS, expected: "^ => Assert position is at the start of the input" },
      { flags: "m", expected: "^ => Assert position is at the start of a line" },
    ].forEach(({ flags, expected }) => {
      it(`should word ^ for flags "${flags}"`, () => {
        // Act
        const [first] = outline("^a", flags);

        // Assert
        expect(first).to.equal(expected);
      });
    });

    [
      { flags: NO_FLAGS, expected: ". => Match any character except a line break" },
      { flags: "s", expected: ". => Match any character" },
    ].forEach(({ flags, expected }) => {
      it(`should word . for flags "${flags}"`, () => {
        // Act
        const lines = outline(".", flags);

        // Assert
        expect(lines).to.deep.equal([expected]);
      });
    });

    [
      { pattern: "\\p{Lu}", expected: "\\p{Lu} => Match an uppercase letter" },
      { pattern: "\\P{L}", expected: "\\P{L} => Match any character that is not a letter" },
      {
        pattern: "\\p{sc=Greek}",
        expected: "\\p{sc=Greek} => Match a character in the Greek script",
      },
      {
        pattern: "\\p{Ideographic}",
        expected: "\\p{Ideographic} => Match a character with Unicode property `Ideographic`",
      },
    ].forEach(({ pattern, expected }) => {
      it(`should describe Unicode property ${pattern}`, () => {
        // Act
        const lines = outline(pattern, "u");

        // Assert
        expect(lines).to.deep.equal([expected]);
      });
    });
  });

  describe("quantifiers", () => {
    [
      {
        pattern: "a?",
        expected: "a? => Match the character `a`, optionally (as many as possible)",
      },
      { pattern: "a{3}", expected: "a{3} => Match the character `a`, exactly 3 times" },
      {
        pattern: "a{2,5}?",
        expected: "a{2,5}? => Match the character `a`, between 2 and 5 times (as few as possible)",
      },
    ].forEach(({ pattern, expected }) => {
      it(`should word ${pattern}`, () => {
        // Act
        const lines = outline(pattern);

        // Assert
        expect(lines).to.deep.equal([expected]);
      });
    });

    it("should keep the children of a quantified group", () => {
      // Act
      const lines = outline("(ab)+");

      // Assert
      expect(lines).to.deep.equal([
        "(ab)+ => Capture group #1, one or more times (as many as possible):",
        "  ab => Match the text `ab`",
      ]);
    });
  });

  describe("groups", () => {
    it("should number groups, list alternatives, and resolve named backreferences", () => {
      // Act
      const lines = outline("(?<q>['\"])(?:cat|dog)\\k<q>");

      // Assert
      expect(lines).to.deep.equal([
        "(?<q>['\"]) => Capture group #1 named `q`:",
        "  ['\"] => Match one of:",
        "    ' => the character `'`",
        '    " => the character `"`',
        "(?:cat|dog) => Group (non-capturing):",
        "  cat|dog => Match one of 2 alternatives:",
        "    cat => Option 1: match the text `cat`",
        "    dog => Option 2: match the text `dog`",
        "\\k<q> => Match the same text last captured by group #1 (`q`)",
      ]);
    });

    it("should apply inline modifiers only inside their group", () => {
      // Act
      const lines = outline("(?i:a)b");

      // Assert
      expect(lines).to.deep.equal([
        "(?i:a) => Group with modifiers (enable ignore case):",
        "  a => Match the character `a` (case-insensitive)",
        "b => Match the character `b`",
      ]);
    });

    [
      {
        pattern: "a(?=b)",
        index: 1,
        expected: /^\(\?=b\) => Lookahead: assert that what follows matches:$/,
      },
      { pattern: "a(?!b)", index: 1, expected: /^\(\?!b\) => Negative lookahead/ },
      { pattern: "(?<=a)b", index: 0, expected: /^\(\?<=a\) => Lookbehind/ },
      { pattern: "(?<!\\$)\\d", index: 0, expected: /^\(\?<!\\\$\) => Negative lookbehind/ },
    ].forEach(({ pattern, index, expected }) => {
      it(`should explain the lookaround in ${pattern}`, () => {
        // Act
        const lines = outline(pattern);

        // Assert
        expect(lines[index]).to.match(expected);
      });
    });
  });

  describe("character classes", () => {
    it("should list the members of a negated class", () => {
      // Act
      const lines = outline("[^a-z_]");

      // Assert
      expect(lines).to.deep.equal([
        "[^a-z_] => Match any character except:",
        "  a-z => a character from the character `a` to the character `z`",
        "  _ => the character `_`",
      ]);
    });

    it("should explain v-flag set subtraction", () => {
      // Act
      const lines = outline("[\\p{L}--[a-z]]", "v");

      // Assert
      expect(lines).to.deep.equal([
        "[\\p{L}--[a-z]] => Match a character in the set:",
        "  \\p{L}--[a-z] => characters that are:",
        "    \\p{L} => in a letter",
        "    [a-z] => but not one of:",
        "      a-z => a character from the character `a` to the character `z`",
      ]);
    });

    it("should list the strings of a \\q{} disjunction", () => {
      // Act
      const lines = outline("[\\q{abc|d}]", "v");

      // Assert
      expect(lines[1]).to.equal("  \\q{abc|d} => one of the strings `abc`, `d`");
    });
  });

  describe("match length", () => {
    [
      { pattern: "abc", expected: { min: 3, max: 3 } },
      { pattern: "a{2,5}", expected: { min: 2, max: 5 } },
      { pattern: "a*", expected: { min: 0, max: Infinity } },
      { pattern: "a|bcd", expected: { min: 1, max: 3 } },
    ].forEach(({ pattern, expected }) => {
      it(`should report the length range of /${pattern}/`, () => {
        // Act
        const { length } = explainValid(pattern);

        // Assert
        expect(length).to.deep.equal(expected);
      });
    });
  });

  describe("backtracking", () => {
    it("should warn about exponential backtracking", () => {
      // Act
      const { warnings } = explainValid("^(a+)+$");

      // Assert
      expect(warnings).to.have.length(1);
      expect(warnings[0]).to.include({ raw: "a+", exponential: true, attackCharacter: "a" });
    });

    [
      { pattern: "^(?:a+)+$", fix: { pattern: "^a+$", flags: "" } },
      { pattern: "^\\d*\\w+$", fix: { pattern: "^\\w+$", flags: "" } },
      // Rewriting would renumber or change what the capture group holds.
      { pattern: "^(a+)+$", fix: undefined },
    ].forEach(({ pattern, fix }) => {
      it(`should suggest ${fix ? `/${fix.pattern}/` : "no fix"} for /${pattern}/`, () => {
        // Act
        const { warnings } = explainValid(pattern);

        // Assert
        expect(warnings[0].fix).to.deep.equal(fix);
      });
    });

    it("should warn about polynomial backtracking between two quantifiers", () => {
      // Act
      const { warnings } = explainValid("^\\d*\\w+$");

      // Assert
      expect(warnings).to.have.length(1);
      expect(warnings[0].exponential).to.equal(false);
    });

    it("should not warn about patterns that only rescan from each offset", () => {
      // Act
      const { warnings } = explainValid("a+b");

      // Assert
      expect(warnings).to.deep.equal([]);
    });

    it("should skip the check when disabled", () => {
      // Act
      const result = explainRegex("^(a+)+$", NO_FLAGS, { checkBacktracking: false });

      // Assert
      expect(result.ok && result.warnings).to.deep.equal([]);
    });
  });

  describe("errors", () => {
    it("should report a syntax error with its index", () => {
      // Act
      const result = explainRegex("a(b");

      // Assert
      expect(result).to.include({ ok: false, index: 3 });
    });

    it("should report invalid flags", () => {
      // Act
      const result = explainRegex("a", "gg");

      // Assert
      expect(result.ok).to.equal(false);
    });
  });

  it("should explain each flag in the order given", () => {
    // Act
    const { flagExplanations } = explainValid("a", "gi");

    // Assert
    expect(flagExplanations.map((f) => f.name)).to.deep.equal(["global", "ignoreCase"]);
  });
});

describe("explainRegex multiline", () => {
  [
    { pattern: "^a$", flags: "m", expected: true },
    { pattern: "(?m:^a$)", flags: "", expected: true },
    { pattern: "(?:x|(?m:^a)+)", flags: "", expected: true },
    { pattern: "(?-m:^a$)", flags: "", expected: false },
    { pattern: "^a$", flags: "gi", expected: false },
  ].forEach(({ pattern, flags, expected }) => {
    it(`should report ${expected} for /${pattern}/${flags}`, () => {
      // Act
      const result = explainValid(pattern, flags);

      // Assert
      expect(result.multiline).to.equal(expected);
    });
  });
});

describe("parseRegexInput", () => {
  [
    { text: "/a+/g", expected: { pattern: "a+", flags: "g" } },
    { text: "a+", expected: { pattern: "a+", flags: "" } },
    { text: "a/b", expected: { pattern: "a/b", flags: "" } },
    { text: "/a[/]b/gi", expected: { pattern: "a[/]b", flags: "gi" } },
    { text: "  /x\\/y/  ", expected: { pattern: "x\\/y", flags: "" } },
    { text: "//", expected: { pattern: "//", flags: "" } },
  ].forEach(({ text, expected }) => {
    it(`should read ${JSON.stringify(text)}`, () => {
      // Act
      const parsed = parseRegexInput(text);

      // Assert
      expect(parsed).to.deep.equal(expected);
    });
  });
});

describe("isRegexSource", () => {
  [
    { value: { pattern: "a", flags: "" }, expected: true },
    { value: { pattern: "a" }, expected: false },
    { value: { pattern: 1, flags: "" }, expected: false },
    { value: "/a/", expected: false },
    { value: undefined, expected: false },
  ].forEach(({ value, expected }) => {
    it(`should return ${expected} for ${JSON.stringify(value)}`, () => {
      // Act & Assert
      expect(isRegexSource(value)).to.equal(expected);
    });
  });
});

describe("describeCount", () => {
  [
    { min: 0, max: 1, expected: "optionally" },
    { min: 0, max: Infinity, expected: "zero or more times" },
    { min: 1, max: Infinity, expected: "one or more times" },
    { min: 4, max: Infinity, expected: "4 or more times" },
    { min: 1, max: 1, expected: "exactly once" },
    { min: 2, max: 2, expected: "exactly 2 times" },
    { min: 2, max: 3, expected: "between 2 and 3 times" },
  ].forEach(({ min, max, expected }) => {
    it(`should word {${min},${max}} as "${expected}"`, () => {
      // Act & Assert
      expect(describeCount(min, max)).to.equal(expected);
    });
  });
});
