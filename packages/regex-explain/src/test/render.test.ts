import { expect } from "chai";
import { describe, it } from "mocha";
import { explainRegex } from "../explainer";
import { ExplanationRenderer } from "../render";
import { explainValid, NO_FLAGS } from "./testing";

describe("ExplanationRenderer.markdownList", () => {
  it("should render nodes as a nested list with code spans", () => {
    // Arrange
    const result = explainValid("(ab)+");

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.include("- `(ab)+` Capture group #1, one or more times (as many as possible):\n");
    expect(md).to.include("  - `ab` Match the text `ab`");
  });

  it("should fence code spans that contain backticks", () => {
    // Arrange
    const result = explainValid("`+");

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.include("- `` `+ ``");
  });

  it("should add a title only when asked", () => {
    // Arrange
    const result = explainValid("a", "g");

    // Act
    const [withTitle, without] = [
      new ExplanationRenderer(result).markdownList({ title: true }),
      new ExplanationRenderer(result).markdownList(),
    ];

    // Assert
    expect(withTitle).to.match(/^# Regex explanation\n\n`\/a\/g`/);
    expect(without).to.not.include("# Regex explanation");
  });

  it("should list flags", () => {
    // Arrange
    const result = explainValid("a", "g");

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.include("**Flags**");
    expect(md).to.include("- `g` *global*:");
  });

  it("should put backtracking warnings and fixes first", () => {
    // Arrange
    const result = explainValid("^(?:a+)+$");

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.match(
      /^> \*\*Warning:\*\* .*exponential time\.\n> Equivalent safe pattern: `\/\^a\+\$\/`/
    );
  });

  it("should point at the position of a syntax error", () => {
    // Arrange
    const result = explainRegex("ab(", NO_FLAGS);

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.include("**Invalid regular expression:**");
    expect(md).to.include("```text\nab(\n   ^\n```");
  });
});

describe("ExplanationRenderer.text", () => {
  it("should align descriptions and quote code", () => {
    // Arrange
    const result = explainValid("^ab");

    // Act
    const text = new ExplanationRenderer(result).text();

    // Assert
    expect(text.split("\n").slice(0, 2)).to.deep.equal([
      "^   Assert position is at the start of the input",
      'ab  Match the text "ab"',
    ]);
  });

  it("should start with the title, then warnings and fixes, and end with the flags", () => {
    // Arrange
    const result = explainRegex("^(?:a+)+$", "i");

    // Act
    const text = new ExplanationRenderer(result).text({ title: true });

    // Assert
    expect(text.split("\n")).to.deep.equal([
      "/^(?:a+)+$/i",
      "",
      'Warning: "a+" is repeated by "(?:a+)+" and can match the same text in many ways, so a ' +
        "failed match can take exponential time.",
      "  Equivalent safe pattern: /^a+$/i",
      "",
      "^        Assert position is at the start of the input",
      "(?:a+)+  Group (non-capturing), one or more times (as many as possible):",
      '  a+     Match the character "a" (case-insensitive), one or more times (as many as possible)',
      "$        Assert position is at the end of the input",
      "",
      "Matches 1 or more characters.",
      "",
      "Flags:",
      "  i  ignoreCase: Ignore case: letters match both upper and lower case.",
    ]);
  });

  it("should leave out the fix, flags, and title when there are none", () => {
    // Arrange
    const result = explainRegex("^(a*)*$", NO_FLAGS);

    // Act
    const text = new ExplanationRenderer(result).text();

    // Assert
    expect(text).to.match(/^Warning: .*\.\n\n\^ /);
    expect(text).to.not.include("Equivalent safe pattern");
    expect(text).to.not.include("Flags:");
  });

  it("should report a syntax error with a caret", () => {
    // Arrange
    const result = explainRegex("ab(", NO_FLAGS);

    // Act
    const text = new ExplanationRenderer(result).text();

    // Assert
    expect(text).to.match(/^Invalid regular expression: .*\n {2}ab\(\n {5}\^$/);
  });
});

describe("ExplanationRenderer.markdownTable", () => {
  it("should render steps as table rows indented by depth", () => {
    // Arrange
    const result = explainValid("(a|b)");

    // Act
    const md = new ExplanationRenderer(result).markdownTable();

    // Assert
    expect(md.split("\n").slice(0, 5)).to.deep.equal([
      "| Code Point | Explanation |",
      "| ---------- | ----------- |",
      "| `(a\\|b)` | Capture group #1: |",
      "| &nbsp;&nbsp;`a\\|b` | Match one of 2 alternatives: |",
      "| &nbsp;&nbsp;&nbsp;&nbsp;`a` | Option 1: match the character `a` |",
    ]);
  });

  it("should render an invalid pattern as the error, without a table", () => {
    // Arrange
    const result = explainRegex("ab(", NO_FLAGS);

    // Act
    const md = new ExplanationRenderer(result).markdownTable();

    // Assert
    expect(md).to.match(/^\*\*Invalid regular expression:\*\*/);
    expect(md).to.not.include("| Code Point |");
  });
});

describe("ExplanationRenderer.model", () => {
  it("should collect the literal, steps, length, and flags", () => {
    // Arrange
    const result = explainValid("a", "y");

    // Act
    const model = new ExplanationRenderer(result).model();

    // Assert
    expect(model).to.deep.equal({
      literal: "/a/y",
      multiline: false,
      warnings: [],
      rows: [
        {
          raw: "a",
          description: "Match the character `a`",
          depth: 0,
          parts: [
            { text: "Match the character ", code: false },
            { text: "a", code: true },
          ],
        },
      ],
      length: "Matches exactly 1 character.",
      flags: [
        {
          flag: "y",
          name: "sticky",
          description: "Match only at the position given by `lastIndex`.",
          parts: [
            { text: "Match only at the position given by ", code: false },
            { text: "lastIndex", code: true },
            { text: ".", code: false },
          ],
        },
      ],
    });
  });

  it("should flatten nested steps with their depths", () => {
    // Act
    const { rows } = new ExplanationRenderer(explainValid("(ab)+")).model();

    // Assert
    expect(rows.map((row) => [row.raw, row.depth])).to.deep.equal([
      ["(ab)+", 0],
      ["ab", 1],
    ]);
  });

  it("should give a warning's fix as a literal", () => {
    // Act
    const [warning] = new ExplanationRenderer(explainValid("^(?:a+)+$")).model().warnings;

    // Assert
    expect(warning.fix).to.equal("/^a+$/");
    expect(warning.parts[0]).to.deep.equal({ text: "a+", code: true });
  });

  it("should give only the error for an invalid pattern", () => {
    // Act
    const model = new ExplanationRenderer(explainRegex("ab(", NO_FLAGS)).model();

    // Assert
    expect(model).to.deep.equal({
      literal: "/ab(/",
      error: {
        message: "Invalid regular expression: /ab(/: Unterminated group",
        pattern: "ab(",
        index: 3,
        caret: "   ^",
      },
      warnings: [],
      rows: [],
      flags: [],
      multiline: false,
    });
  });

  [
    { pattern: "(?:)", expected: "Matches the empty string only (zero characters)." },
    { pattern: "a", expected: "Matches exactly 1 character." },
    { pattern: "a*", expected: "Matches any number of characters, including none." },
    { pattern: "a+", expected: "Matches 1 or more characters." },
    { pattern: "a{2,}", expected: "Matches 2 or more characters." },
    { pattern: "a{2,4}", expected: "Matches 2 to 4 characters." },
  ].forEach(({ pattern, expected }) => {
    it(`should describe the length of /${pattern}/`, () => {
      // Act & Assert
      expect(new ExplanationRenderer(explainValid(pattern)).model().length).to.equal(expected);
    });
  });
});
