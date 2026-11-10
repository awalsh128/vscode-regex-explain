import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import * as path from "path";
import * as vscode from "vscode";
import { RegexMatcher } from "../../matcher";
import { EXPLAIN_COMMAND } from "../../preview";
import { ExplanationPanel, VIEW_TYPE } from "../../webview/host";
import { PanelTemplate } from "../../webview/panel";
import { EXTENSION_DIR } from "./paths";
import { activateExtension, waitFor } from "./testing";

/** A regex whose matches are easy to recognize. */
const INPUT = { pattern: "a+", flags: "g" };

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
 * Creates a panel that runs regexes with the bundled worker, as the extension does.
 *
 * @returns The panel.
 */
function newPanel(): ExplanationPanel {
  return new ExplanationPanel(
    vscode.Uri.file(EXTENSION_DIR),
    new RegexMatcher(path.join(EXTENSION_DIR, "dist", "matchWorker.js")),
    new PanelTemplate(path.join(EXTENSION_DIR, "dist"))
  );
}

describe("ExplanationPanel", () => {
  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should answer a match request with the matches of the shown regex", async () => {
    // Arrange
    const panel = newPanel();
    panel.show(INPUT);

    // Act
    const reply = await panel.respond({ type: "match", id: 7, text: "baaa\na", entries: false });
    panel.dispose();

    // Assert
    expect(reply?.id).to.equal(7);
    expect(reply?.model.matches.map((m) => [m.text, m.lines])).to.deep.equal([
      ["aaa", "L1"],
      ["a", "L2"],
    ]);
  });

  [
    { name: "an unknown message", message: { type: "other" } },
    { name: "a malformed match request", message: { type: "match", id: "1" } },
  ].forEach(({ name, message }) => {
    it(`should not answer ${name}`, async () => {
      // Arrange
      const panel = newPanel();
      panel.show(INPUT);

      // Act
      const reply = await panel.respond(message);
      panel.dispose();

      // Assert
      expect(reply).to.equal(undefined);
    });
  });

  it("should not answer before a regex is shown", async () => {
    // Arrange
    const panel = newPanel();

    // Act
    const reply = await panel.respond({ type: "match", id: 1, text: "a", entries: false });

    // Assert
    expect(reply).to.equal(undefined);
  });
});

describe("ExplainCommandHandler", () => {
  afterEach(async () => {
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
});
