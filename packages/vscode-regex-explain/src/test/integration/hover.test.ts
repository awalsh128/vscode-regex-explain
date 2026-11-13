import { expect } from "chai";
import { describe, it } from "mocha";
import * as vscode from "vscode";
import { activateExtension, openEditor, regexHovers, setSetting } from "./testing";

/** A position inside the literal of {@link SOURCE}. */
const IN_LITERAL = new vscode.Position(0, 13);

/** Source with one literal, in a language whose literals are found automatically. */
const SOURCE = "const re = /a+/g;";

/** A pattern with exponential backtracking. */
const SLOW_SOURCE = "const re = /^(a+)+$/;";

describe("RegexHoverProvider", () => {
  it("should explain the literal under the pointer", async () => {
    // Arrange
    await activateExtension();
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const hovers = await regexHovers(editor.document, IN_LITERAL);

    // Assert
    expect(hovers).to.have.length(1);
    expect(hovers[0]).to.include("one or more times");
    expect(hovers[0]).to.include("*global*");
  });

  it("should start with a button that opens the panel for the same regex", async () => {
    // Arrange
    await activateExtension();
    const editor = await openEditor(SOURCE, "typescript");
    const args = encodeURIComponent(JSON.stringify([{ pattern: "a+", flags: "g" }]));

    // Act
    const hovers = await regexHovers(editor.document, IN_LITERAL);

    // Assert
    expect(
      hovers[0].startsWith(
        `[$(open-preview) Open explanation](command:regexExplain.explain?${args} "Open the explanation and a match tester beside the editor")\n\n`
      )
    ).to.equal(true);
  });

  [
    { language: "javascript", source: 'new RegExp("a+")' },
    { language: "javascriptreact", source: "<a title={/a+/.source} />" },
    { language: "typescriptreact", source: "<a title={/a+/.source} />" },
    { language: "python", source: 're.compile(r"a+")' },
    { language: "go", source: "package m\nvar r = regexp.MustCompile(`a+`)" },
    { language: "rust", source: 'fn f() { Regex::new(r"a+"); }' },
    { language: "java", source: 'class A { Object p = Pattern.compile("a+"); }' },
    { language: "csharp", source: 'class A { object r = new Regex(@"a+"); }' },
    { language: "ruby", source: "r = /a+/" },
    { language: "php", source: "<?php preg_match('/a+/', $s);" },
  ].forEach(({ language, source }) => {
    it(`should explain a regex in ${language}`, async () => {
      // Arrange
      await activateExtension();
      const editor = await openEditor(source, language);
      const position = editor.document.positionAt(source.indexOf("a+") + 1);

      // Act
      const hovers = await regexHovers(editor.document, position);

      // Assert
      expect(hovers).to.have.length(1);
      expect(hovers[0]).to.include("one or more times");
    });
  });

  it("should explain a selection in any language", async () => {
    // Arrange
    await activateExtension();
    const editor = await openEditor("DATE = r'\\d{4}-\\d{2}'", "python");
    editor.selection = new vscode.Selection(0, 10, 0, 21);

    // Act
    const hovers = await regexHovers(editor.document, new vscode.Position(0, 12));

    // Assert
    expect(hovers).to.have.length(1);
    expect(hovers[0]).to.include("exactly 4 times");
  });

  it("should show nothing outside a literal", async () => {
    // Arrange
    await activateExtension();
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const hovers = await regexHovers(editor.document, new vscode.Position(0, 2));

    // Assert
    expect(hovers).to.deep.equal([]);
  });

  it("should show nothing when hover.enabled is false", async () => {
    // Arrange
    await activateExtension();
    await setSetting("hover.enabled", false);
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const hovers = await regexHovers(editor.document, IN_LITERAL);

    // Assert
    expect(hovers).to.deep.equal([]);
  });

  [
    { checkBacktracking: true, expected: true },
    { checkBacktracking: false, expected: false },
  ].forEach(({ checkBacktracking, expected }) => {
    it(`should ${expected ? "" : "not "}warn about backtracking when checkBacktracking is ${checkBacktracking}`, async () => {
      // Arrange
      await activateExtension();
      await setSetting("checkBacktracking", checkBacktracking);
      const editor = await openEditor(SLOW_SOURCE, "typescript");

      // Act
      const hovers = await regexHovers(editor.document, IN_LITERAL);

      // Assert
      expect(hovers[0].includes("**Warning:**")).to.equal(expected);
    });
  });
});
