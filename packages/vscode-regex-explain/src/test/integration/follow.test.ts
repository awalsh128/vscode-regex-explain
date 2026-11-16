import { expect } from "chai";
import { afterEach, describe, it } from "mocha";
import * as path from "path";
import { RegexFinder } from "regex-explain";
import * as vscode from "vscode";
import { FOLLOW_DELAY_MS, PanelFollower } from "../../follow";
import { RegexHoverProvider } from "../../hover";
import { RegexMatcher } from "../../matcher";
import { RegexLocator } from "../../targets";
import { ExplanationPanel } from "../../webview/host";
import { PanelTemplate } from "../../webview/panel";
import { EXTENSION_DIR } from "./paths";
import { openEditor, setSetting, waitFor } from "./testing";

/** Source with two literals: `/a+/g` at offsets 10-15 and `/b+/i` at offsets 26-31. */
const SOURCE = "const x = /a+/g; const y = /b+/i; const z = 1;";

/** A position inside the first literal. */
const IN_FIRST = new vscode.Position(0, 12);

/** A position inside the second literal. */
const IN_SECOND = new vscode.Position(0, 28);

/** A position outside both literals. */
const OUTSIDE = new vscode.Position(0, 42);

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

/**
 * Creates a locator that loads grammars from the bundle, as the extension does.
 *
 * @returns The locator.
 */
function newLocator(): RegexLocator {
  return new RegexLocator(new RegexFinder(path.join(EXTENSION_DIR, "dist")));
}

/**
 * Moves an editor's cursor.
 *
 * @param editor The editor.
 * @param position Where to put the cursor.
 */
function moveCursor(editor: vscode.TextEditor, position: vscode.Position): void {
  editor.selection = new vscode.Selection(position, position);
}

/**
 * Waits long enough for the follower to have acted on a change.
 *
 * @returns Resolves after a few follow delays.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, FOLLOW_DELAY_MS * 3));
}

describe("ExplanationPanel.follow", () => {
  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should leave a closed panel closed", () => {
    // Arrange
    const panel = newPanel();

    // Act
    const changed = panel.follow({ pattern: "a", flags: "" });

    // Assert
    expect(changed).to.equal(false);
    expect(panel.shown).to.equal(undefined);
  });

  it("should show a different regex in the open panel, and only once", () => {
    // Arrange
    const panel = newPanel();
    panel.show({ pattern: "a", flags: "" });

    // Act
    const first = panel.follow({ pattern: "b", flags: "i" });
    const again = panel.follow({ pattern: "b", flags: "i" });
    panel.dispose();

    // Assert
    expect([first, again]).to.deep.equal([true, false]);
  });
});

describe("PanelFollower", () => {
  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should show the regex the cursor moves to", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });
    await vscode.window.showTextDocument(editor.document);

    // Act
    moveCursor(editor, IN_SECOND);
    await waitFor(() => panel.shown?.pattern === "b+");
    const shown = panel.shown;
    follower.dispose();
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "b+", flags: "i" });
  });

  it("should show the selection, in a language without regex detection", async () => {
    // Arrange
    const editor = await openEditor("find x+y here", "plaintext");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });
    await vscode.window.showTextDocument(editor.document);

    // Act
    editor.selection = new vscode.Selection(0, 5, 0, 8);
    await waitFor(() => panel.shown?.pattern === "x+y");
    const shown = panel.shown;
    follower.dispose();
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "x+y", flags: "" });
  });

  it("should show the regex as it is edited", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });
    await vscode.window.showTextDocument(editor.document);
    moveCursor(editor, IN_FIRST);

    // Act
    await editor.edit((edit) => edit.insert(new vscode.Position(0, 13), "b"));
    await waitFor(() => panel.shown?.pattern === "a+b");
    const shown = panel.shown;
    follower.dispose();
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "a+b", flags: "g" });
  });

  it("should keep the regex when the cursor leaves it", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });
    await vscode.window.showTextDocument(editor.document);

    // Act
    moveCursor(editor, OUTSIDE);
    await settle();
    const shown = panel.shown;
    follower.dispose();
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "a+", flags: "g" });
  });

  it("should not follow when regexExplain.panel.follow is off", async () => {
    // Arrange
    await setSetting("panel.follow", false);
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });
    await vscode.window.showTextDocument(editor.document);

    // Act
    moveCursor(editor, IN_SECOND);
    await settle();
    const shown = panel.shown;
    follower.dispose();
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "a+", flags: "g" });
  });

  it("should not open the panel", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const follower = new PanelFollower(newLocator(), panel);

    // Act
    moveCursor(editor, IN_SECOND);
    await settle();
    follower.dispose();

    // Assert
    expect(panel.shown).to.equal(undefined);
  });
});

describe("RegexHoverProvider following", () => {
  afterEach(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  it("should show the hovered regex in the open panel", async () => {
    // Arrange
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const provider = new RegexHoverProvider(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });

    // Act
    await provider.provideHover(editor.document, IN_SECOND);
    const shown = panel.shown;
    panel.dispose();

    // Assert
    expect(shown).to.deep.equal({ pattern: "b+", flags: "i" });
  });

  it("should not show the hovered regex when regexExplain.panel.follow is off", async () => {
    // Arrange
    await setSetting("panel.follow", false);
    const editor = await openEditor(SOURCE, "typescript");
    const panel = newPanel();
    const provider = new RegexHoverProvider(newLocator(), panel);
    panel.show({ pattern: "a+", flags: "g" });

    // Act
    const hover = await provider.provideHover(editor.document, IN_SECOND);
    const shown = panel.shown;
    panel.dispose();

    // Assert
    expect(hover).to.not.equal(undefined);
    expect(shown).to.deep.equal({ pattern: "a+", flags: "g" });
  });
});
