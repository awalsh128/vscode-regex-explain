import { expect } from "chai";
import { describe, it } from "mocha";
import { SyntaxTreeNode } from "../compiler";
import { explainRegex } from "../explainer";
import { ExplanationRenderer, syntaxTreeSvg } from "../render";
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
    expect(md).to.equal(
      "**Invalid regular expression:** Unterminated group\n\n```text\nab(\n   ^\n```"
    );
  });
  it("should show only the line with the error of a multi-line pattern", () => {
    // Arrange
    const result = explainRegex("ab\ncd(", NO_FLAGS);

    // Act
    const md = new ExplanationRenderer(result).markdownList();

    // Assert
    expect(md).to.include("```text\ncd(\n   ^\n```");
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

  it("should show only the line with the error of a multi-line pattern", () => {
    // Arrange
    const result = explainRegex("const a = 1;\nconst b = (;\nconst c = 3;", NO_FLAGS);

    // Act
    const text = new ExplanationRenderer(result).text();

    // Assert
    expect(text.split("\n").slice(-2)).to.deep.equal(["  const c = 3;", "              ^"]);
  });

  it("should report a syntax error with a caret", () => {
    // Arrange
    const result = explainRegex("ab(", NO_FLAGS);

    // Act
    const text = new ExplanationRenderer(result).text();

    // Assert
    expect(text).to.equal("Invalid regular expression: Unterminated group\n  ab(\n     ^");
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
      "| Pattern | Explanation |",
      "| ------- | ----------- |",
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
    expect(md).to.equal(
      "**Invalid regular expression:** Unterminated group\n\n```text\nab(\n   ^\n```"
    );
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
        message: "Unterminated group",
        pattern: "ab(",
        index: 3,
        line: "ab(",
        caret: "   ^",
      },
      warnings: [],
      rows: [],
      flags: [],
      multiline: false,
    });
  });

  [
    { pattern: "a", flags: "x", expected: "Invalid flag 'x'" },
    { pattern: "(", flags: "u", expected: "Unterminated group" },
    { pattern: "a/: b(", flags: NO_FLAGS, expected: "Unterminated group" },
  ].forEach(({ pattern, flags, expected }) => {
    it(`should reduce the error for /${pattern}/${flags} to "${expected}"`, () => {
      // Act
      const model = new ExplanationRenderer(explainRegex(pattern, flags)).model();

      // Assert
      expect(model.error?.message).to.equal(expected);
    });
  });

  [
    { pattern: "ab\ncd(", line: "cd(", caret: "   ^" },
    { pattern: "x\r\ny)", line: "y)", caret: " ^" },
    { pattern: "a)\n", line: "a)", caret: " ^" },
  ].forEach(({ pattern, line, caret }) => {
    it(`should point at the error within its line of ${JSON.stringify(pattern)}`, () => {
      // Act
      const { error } = new ExplanationRenderer(explainRegex(pattern, NO_FLAGS)).model();

      // Assert
      expect({ line: error?.line, caret: error?.caret }).to.deep.equal({ line, caret });
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

/**
 * Builds a syntax tree node for drawing, where offsets do not matter.
 *
 * @param type The node type.
 * @param text The source text.
 * @param children The child nodes.
 *
 * @returns The node, without an error.
 */
function syntaxNode(
  type: string,
  text: string,
  children: readonly SyntaxTreeNode[] = []
): SyntaxTreeNode {
  return { type, text, start: 0, end: text.length, error: false, children };
}

describe("syntaxTreeSvg", () => {
  it("should center each node over its children", () => {
    // Arrange
    const tree = syntaxNode("pattern", "a+", [
      syntaxNode("term", "a+", [
        syntaxNode("pattern_character", "a"),
        syntaxNode("one_or_more", "+"),
      ]),
    ]);

    // Act
    const svg = syntaxTreeSvg(tree);

    // Assert
    expect(svg.split("\n")).to.deep.equal([
      '<svg xmlns="http://www.w3.org/2000/svg" class="syntax-tree" width="253.6" height="172" viewBox="0 0 253.6 172" font-family="monospace" font-size="12" role="img" aria-label="Syntax tree of a+">',
      '<g transform="translate(4 4)">',
      '<line class="edge" x1="133.6" y1="36" x2="133.6" y2="64" stroke="currentColor"/>',
      '<line class="edge" x1="133.6" y1="100" x2="69.2" y2="128" stroke="currentColor"/>',
      '<line class="edge" x1="133.6" y1="100" x2="198" y2="128" stroke="currentColor"/>',
      '<g class="node"><title>pattern: a+</title><rect x="100.4" y="0" width="66.4" height="36" rx="4" fill="none" stroke="currentColor"/><text class="type" x="133.6" y="14" text-anchor="middle" fill="currentColor">pattern</text><text class="text" x="133.6" y="29" text-anchor="middle" fill="currentColor">a+</text></g>',
      '<g class="node"><title>term: a+</title><rect x="111.2" y="64" width="44.8" height="36" rx="4" fill="none" stroke="currentColor"/><text class="type" x="133.6" y="78" text-anchor="middle" fill="currentColor">term</text><text class="text" x="133.6" y="93" text-anchor="middle" fill="currentColor">a+</text></g>',
      '<g class="node"><title>pattern_character: a</title><rect x="0" y="128" width="138.4" height="36" rx="4" fill="none" stroke="currentColor"/><text class="type" x="69.2" y="142" text-anchor="middle" fill="currentColor">pattern_character</text><text class="text" x="69.2" y="157" text-anchor="middle" fill="currentColor">a</text></g>',
      '<g class="node"><title>one_or_more: +</title><rect x="150.4" y="128" width="95.2" height="36" rx="4" fill="none" stroke="currentColor"/><text class="type" x="198" y="142" text-anchor="middle" fill="currentColor">one_or_more</text><text class="text" x="198" y="157" text-anchor="middle" fill="currentColor">+</text></g>',
      "</g>",
      "</svg>",
    ]);
  });

  it("should escape text and shorten long labels, keeping the full text in the tooltip", () => {
    // Arrange
    const text = "<b>&'\"".padEnd(30, "x");

    // Act
    const svg = syntaxTreeSvg(syntaxNode("term", text));

    // Assert
    expect(svg).to.include(
      "<title>term: &lt;b&gt;&amp;&#39;&quot;xxxxxxxxxxxxxxxxxxxxxxxx</title>"
    );
    expect(svg).to.include(">&lt;b&gt;&amp;&#39;&quot;xxxxxxxxxxxxxxxxx…</text>");
  });

  it("should mark error nodes and leave out the text of missing ones", () => {
    // Arrange
    const missing: SyntaxTreeNode = { ...syntaxNode(")", ""), error: true };

    // Act
    const svg = syntaxTreeSvg(syntaxNode("anonymous_capturing_group", "(a", [missing]));

    // Assert
    expect(svg).to.include(
      '<g class="node error"><title>)</title><rect x="86.4" y="64" width="23.2" height="36" rx="4" fill="none" stroke="currentColor"/><text class="type" x="98" y="78" text-anchor="middle" fill="currentColor">)</text></g>'
    );
  });
});
