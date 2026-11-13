import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import * as path from "path";
import { RegexFinder, RegexSource } from "regex-explain";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { EXPLAIN_COMMAND, ExplainCommandHandler } from "../../explain";
import { RegexLocator } from "../../targets";
import { ExplanationPanel, VIEW_TYPE } from "../../webview/host";
import { EXTENSION_DIR } from "./paths";
import { activateExtension, openEditor, waitFor } from "./testing";

/** A regex whose matches are easy to recognize. */
const INPUT = { pattern: "a+", flags: "g" };

/** Source with one literal, `/b+/i`, at offsets 11 to 16. */
const SOURCE = "const re = /b+/i;";

/**
 * Lists the open explanation panels' tabs.
 *
 * @returns The tabs, in every editor group.
 */
function panelTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputWebview)
    .filter((tab) => (tab.input as vscode.TabInputWebview).viewType.endsWith(VIEW_TYPE));
}

/**
 * Creates a handler that finds regexes as the extension does and records what it would show.
 *
 * @returns The handler and the regexes passed to the panel.
 */
function newHandler(): { handler: ExplainCommandHandler; shown: RegexSource[] } {
  const shown: RegexSource[] = [];
  const panel = { show: (input: RegexSource) => shown.push(input) } as unknown as ExplanationPanel;
  const locator = new RegexLocator(new RegexFinder(path.join(EXTENSION_DIR, "dist")));
  return { handler: new ExplainCommandHandler(locator, panel), shown };
}

describe("ExplainCommandHandler", () => {
  afterEach(async () => {
    sinon.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should open the explanation panel for a regex passed by a hover button", async () => {
    // Arrange
    await activateExtension();

    // Act
    await vscode.commands.executeCommand(EXPLAIN_COMMAND, INPUT);

    // Assert
    await waitFor(() => panelTabs().length === 1);
    expect(panelTabs()[0].label).to.equal("Regex Explanation");
  });

  it("should reuse the open panel for the next regex", async () => {
    // Arrange
    await activateExtension();
    await vscode.commands.executeCommand(EXPLAIN_COMMAND, INPUT);
    await waitFor(() => panelTabs().length === 1);

    // Act
    await vscode.commands.executeCommand(EXPLAIN_COMMAND, { pattern: "b", flags: "" });

    // Assert
    expect(panelTabs()).to.have.length(1);
  });

  [
    {
      name: "the selection",
      selection: new vscode.Selection(0, 0, 0, 5),
      arg: undefined,
      expected: { pattern: "const", flags: "" },
    },
    {
      name: "the regex at the cursor",
      selection: new vscode.Selection(0, 13, 0, 13),
      arg: undefined,
      expected: { pattern: "b+", flags: "i" },
    },
    {
      name: "the regex at the cursor, ignoring a menu's URI",
      selection: new vscode.Selection(0, 13, 0, 13),
      arg: vscode.Uri.file("menu"),
      expected: { pattern: "b+", flags: "i" },
    },
    {
      name: "a hover button's regex, not the one at the cursor",
      selection: new vscode.Selection(0, 13, 0, 13),
      arg: INPUT,
      expected: INPUT,
    },
  ].forEach(({ name, selection, arg, expected }) => {
    it(`should explain ${name}`, async () => {
      // Arrange
      const editor = await openEditor(SOURCE, "typescript");
      editor.selection = selection;
      const prompt = sinon.stub(vscode.window, "showInputBox");
      const { handler, shown } = newHandler();

      // Act
      await handler.execute(arg);

      // Assert
      expect(shown).to.deep.equal([expected]);
      expect(prompt.called).to.equal(false);
    });
  });

  [
    { name: "explain a typed pattern", typed: "a|b", expected: [{ pattern: "a|b", flags: "" }] },
    {
      name: "explain a typed literal",
      typed: "/ab+c/gi",
      expected: [{ pattern: "ab+c", flags: "gi" }],
    },
    { name: "explain nothing if the prompt is cancelled", typed: undefined, expected: [] },
  ].forEach(({ name, typed, expected }) => {
    it(`should ${name} when no regex is at the cursor`, async () => {
      // Arrange
      await openEditor("plain words", "plaintext");
      sinon.stub(vscode.window, "showInputBox").resolves(typed);
      const { handler, shown } = newHandler();

      // Act
      await handler.execute();

      // Assert
      expect(shown).to.deep.equal(expected);
    });
  });

  [
    { typed: "/ab+c/gi", expected: undefined },
    { typed: "a(", expected: "Invalid regular expression: /a(/: Unterminated group" },
    { typed: "/a/x", expected: "Invalid regular expression: Invalid flag 'x'" },
  ].forEach(({ typed, expected }) => {
    it(`should validate ${typed} as it is typed`, async () => {
      // Arrange
      await openEditor("plain words", "plaintext");
      const prompt = sinon.stub(vscode.window, "showInputBox").resolves(undefined);
      const { handler } = newHandler();
      await handler.execute();
      const validate = prompt.firstCall.args[0]?.validateInput;

      // Act
      const message = await validate?.(typed);

      // Assert
      expect(message).to.equal(expected);
    });
  });
});
