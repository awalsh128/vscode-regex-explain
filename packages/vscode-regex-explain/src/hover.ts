/**
 * The hover provider: explains the selection or the regex under the pointer, with a button that
 * opens the explanation panel, and shows the hovered regex in the panel when it is open.
 */
import { explainRegex, ExplanationRenderer } from "regex-explain";
import * as vscode from "vscode";
import { getConfig } from "./configuration";
import { EXPLAIN_COMMAND } from "./preview";
import { RegexLocator } from "./targets";
import { ExplanationPanel } from "./webview/host";

/** Label of the hover button that opens the explanation panel. */
const OPEN_LABEL = "Open explanation";

/**
 * Shows an explanation when hovering a regex in code or a selected pattern, and shows the hovered
 * regex in the explanation panel when it is open.
 */
export class RegexHoverProvider implements vscode.HoverProvider {
  private readonly locator: RegexLocator;
  private readonly panel: ExplanationPanel;

  /**
   * Constructs a new RegexHoverProvider.
   *
   * @param locator Finds the regex under the pointer.
   * @param panel The explanation panel, which follows the hovered regex while it is open.
   */
  constructor(locator: RegexLocator, panel: ExplanationPanel) {
    this.locator = locator;
    this.panel = panel;
  }

  /**
   * Explains the selection containing the position, else the regex under it.
   *
   * @param document The hovered document.
   * @param position The hovered position.
   *
   * @returns The hover, or undefined when there is nothing to explain.
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | undefined> {
    const config = getConfig(document);
    if (!config.hoverEnabled) {
      return undefined;
    }
    // Selections are only known for the active editor; hovers elsewhere fall back to code.
    const editor = vscode.window.activeTextEditor;
    const target =
      (editor?.document === document ? this.locator.selectionAt(editor, position) : undefined) ??
      (await this.locator.regexAt(document, position));
    if (!target) {
      return undefined;
    }

    if (config.panelFollow) {
      this.panel.follow(target.input, document);
    }
    const { pattern, flags } = target.input;
    const result = explainRegex(pattern, flags, { checkBacktracking: config.checkBacktracking });
    const args = encodeURIComponent(JSON.stringify([target.input]));
    const md = new vscode.MarkdownString();
    md.appendMarkdown(
      `[$(open-preview) ${OPEN_LABEL}](command:${EXPLAIN_COMMAND}?${args} "Open the explanation and a match tester beside the editor")`
    );
    md.appendMarkdown("\n\n");
    md.appendMarkdown(new ExplanationRenderer(result).markdownList());
    md.supportThemeIcons = true;
    md.isTrusted = { enabledCommands: [EXPLAIN_COMMAND] };
    return new vscode.Hover(md, target.range);
  }
}
