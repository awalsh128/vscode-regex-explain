import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import * as path from "path";
import * as vscode from "vscode";
import { RegexMatcher } from "../../matcher";
import { ExplanationPanel } from "../../webview/host";
import { PanelTemplate } from "../../webview/panel";
import { EXTENSION_DIR } from "./paths";

/** A regex whose matches are easy to recognize. */
const INPUT = { pattern: "a+", flags: "g" };

/**
 * Creates a panel that runs regexes with the bundled worker and renders the bundled templates, as
 * the extension does.
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
    expect(reply?.regex101Url).to.equal(
      "https://regex101.com/?regex=a%2B&flags=g&flavor=javascript&testString=baaa%0Aa"
    );
    expect(reply?.model.matches.map((m) => [m.text, m.lines])).to.deep.equal([
      ["aaa", "L1"],
      ["a", "L2"],
    ]);
  });

  it("should match each line on its own when asked for entries", async () => {
    // Arrange
    const panel = newPanel();
    panel.show(INPUT);

    // Act
    const reply = await panel.respond({ type: "match", id: 8, text: "baaa\nb", entries: true });
    panel.dispose();

    // Assert
    expect(reply?.model.summary).to.equal("1 of 2 entries matches.");
    expect(reply?.model.entries?.map((e) => [e.line, e.matched])).to.deep.equal([
      ["L1", true],
      ["L2", false],
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

  it("should drop the reply to a request that a newer one supersedes", async () => {
    // Arrange
    const panel = newPanel();
    panel.show(INPUT);

    // Act
    const [first, second] = await Promise.all([
      panel.respond({ type: "match", id: 1, text: "a", entries: false }),
      panel.respond({ type: "match", id: 2, text: "aa", entries: false }),
    ]);
    panel.dispose();

    // Assert
    expect(first).to.equal(undefined);
    expect(second?.model.matches.map((m) => m.text)).to.deep.equal(["aa"]);
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
