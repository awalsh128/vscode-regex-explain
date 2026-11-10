/**
 * Keeps the open explanation panel on the regex the user is working with: as the cursor moves to
 * another regex, a selection changes, or the regex is edited, the panel shows the regex at the
 * cursor. The hover provider does the same for hovered regexes. `regexExplain.panel.follow` turns
 * both off.
 */
import * as vscode from "vscode";
import { getConfig } from "./configuration";
import { RegexLocator } from "./targets";
import { ExplanationPanel } from "./webview/host";

/** Wait after the cursor, selection, or text stops changing before looking, in milliseconds. */
export const FOLLOW_DELAY_MS = 200;

/** Shows the regex at the cursor of the active editor in the open explanation panel. */
export class PanelFollower implements vscode.Disposable {
  private readonly locator: RegexLocator;
  private readonly panel: ExplanationPanel;
  private readonly subscriptions: vscode.Disposable[];
  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Constructs a new PanelFollower, which starts listening at once.
   *
   * @param locator Finds the regex at the cursor.
   * @param panel The panel to update.
   */
  constructor(locator: RegexLocator, panel: ExplanationPanel) {
    this.locator = locator;
    this.panel = panel;
    this.subscriptions = [
      vscode.window.onDidChangeTextEditorSelection((event) => this.schedule(event.textEditor)),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document === event.document) {
          this.schedule(editor);
        }
      }),
    ];
  }

  /**
   * Looks at an editor once changes settle, so that typing or dragging a selection does not
   * re-render the panel at every step.
   *
   * @param editor The editor that changed.
   */
  private schedule(editor: vscode.TextEditor): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.update(editor), FOLLOW_DELAY_MS);
  }

  /**
   * Shows the regex at an editor's cursor in the open panel. Positions without a regex leave the
   * panel as it is.
   *
   * @param editor The editor.
   */
  private async update(editor: vscode.TextEditor): Promise<void> {
    if (!this.panel.shown || editor.document.isClosed || !getConfig(editor.document).panelFollow) {
      return;
    }
    const target = await this.locator.targetAt(editor);
    if (target) {
      this.panel.follow(target.input, editor.document);
    }
  }

  /** Stops listening. */
  dispose(): void {
    clearTimeout(this.timer);
    this.subscriptions.forEach((subscription) => subscription.dispose());
  }
}
