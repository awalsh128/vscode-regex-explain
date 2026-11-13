import { expect } from "chai";
import { describe, it } from "mocha";
import * as path from "path";
import { RegexFinder } from "regex-explain";
import * as vscode from "vscode";
import { RegexLocator } from "../../targets";
import { EXTENSION_DIR } from "./paths";
import { openEditor, setSetting } from "./testing";

/** Source with one literal; offset 11 is the opening slash. */
const SOURCE = "const re = /a+/g;";

/** A position inside the literal of {@link SOURCE}. */
const IN_LITERAL = new vscode.Position(0, 13);

/** The position right after the literal of {@link SOURCE}, before the semicolon. */
const AFTER_LITERAL = new vscode.Position(0, 16);

/**
 * Creates a locator that loads grammars from the bundle, as the extension does.
 *
 * @returns The locator.
 */
function locator(): RegexLocator {
  return new RegexLocator(new RegexFinder(path.join(EXTENSION_DIR, "dist")));
}

describe("RegexLocator", () => {
  it("should find the literal under the cursor in a configured language", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const target = await locator().regexAt(editor.document, IN_LITERAL);

    // Assert
    expect(target?.input).to.deep.equal({ pattern: "a+", flags: "g" });
    expect(target?.range.isEqual(new vscode.Range(0, 11, 0, 16))).to.equal(true);
  });

  it("should find a pattern string passed to a regex API", async () => {
    // Arrange
    const editor = await openEditor('DATE = re.compile(r"\\d{4}")', "python");

    // Act
    const target = await locator().regexAt(editor.document, new vscode.Position(0, 21));

    // Assert
    expect(target?.input).to.deep.equal({ pattern: "\\d{4}", flags: "" });
    expect(target?.range.isEqual(new vscode.Range(0, 18, 0, 26))).to.equal(true);
  });

  it("should not look for regexes in unsupported languages", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "plaintext");

    // Act
    const target = await locator().regexAt(editor.document, IN_LITERAL);

    // Assert
    expect(target).to.equal(undefined);
  });

  it("should follow the hover.languages setting", async () => {
    // Arrange
    await setSetting("hover.languages", ["python"]);
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const target = await locator().regexAt(editor.document, IN_LITERAL);

    // Assert
    expect(target).to.equal(undefined);
  });

  it("should see edits made after an earlier lookup", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const regexLocator = locator();
    await regexLocator.regexAt(editor.document, IN_LITERAL);
    await editor.edit((edit) => edit.replace(new vscode.Range(0, 12, 0, 14), "b*"));

    // Act
    const target = await regexLocator.regexAt(editor.document, IN_LITERAL);

    // Assert
    expect(target?.input.pattern).to.equal("b*");
  });

  it("should find the literal when the cursor is right after it", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const target = await locator().targetAt(editor, AFTER_LITERAL);

    // Assert
    expect(target?.input).to.deep.equal({ pattern: "a+", flags: "g" });
  });

  it("should not find the literal when hovering the character after it", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");

    // Act
    const target = await locator().regexAt(editor.document, AFTER_LITERAL);

    // Assert
    expect(target).to.equal(undefined);
  });

  it("should prefer a selection containing the position", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    editor.selection = new vscode.Selection(0, 12, 0, 13);

    // Act
    const target = await locator().targetAt(editor, new vscode.Position(0, 12));

    // Assert
    expect(target?.input).to.deep.equal({ pattern: "a", flags: "" });
  });

  it("should ignore selections that do not contain the position", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    editor.selection = new vscode.Selection(0, 0, 0, 5);

    // Act
    const target = locator().selectionAt(editor, IN_LITERAL);

    // Assert
    expect(target).to.equal(undefined);
  });
});
