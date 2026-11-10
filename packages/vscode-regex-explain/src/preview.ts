/** The explain command: picks the regex to explain and shows it in the explanation panel. */
import { explainRegex, isRegexSource, parseRegexInput, RegexSource } from "regex-explain";
import * as vscode from "vscode";
import { RegexLocator } from "./targets";
import { ExplanationPanel } from "./webview/host";

/** Command that opens an explanation beside the editor. */
export const EXPLAIN_COMMAND = "regexExplain.explain";

/** Handles {@link EXPLAIN_COMMAND}. */
export class ExplainCommandHandler {
  private readonly locator: RegexLocator;
  private readonly panel: ExplanationPanel;

  /**
   * Constructs a new ExplainCommandHandler.
   *
   * @param locator Finds the regex at the cursor.
   * @param panel Shows the explanation.
   */
  constructor(locator: RegexLocator, panel: ExplanationPanel) {
    this.locator = locator;
    this.panel = panel;
  }

  /**
   * Explains, in order of preference: a regex passed by a hover button, the selection or regex at
   * the cursor, or a regex the user types.
   *
   * @param arg A {@link RegexSource} from a hover button; menus pass a URI, which is ignored.
   *
   * @returns Resolves once the panel shows the regex, or the user cancels.
   */
  async execute(arg?: unknown): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const input =
      (isRegexSource(arg) ? arg : undefined) ??
      (editor ? (await this.locator.targetAt(editor))?.input : undefined) ??
      (await promptForRegex());
    if (input) {
      this.panel.show(input, editor?.document);
    }
  }
}

/**
 * Asks the user to type a regex, validating it as they type.
 *
 * @returns The regex, or undefined if the user cancels.
 */
async function promptForRegex(): Promise<RegexSource | undefined> {
  const text = await vscode.window.showInputBox({
    title: "Explain Regex",
    prompt: "Enter a pattern, or a literal such as /ab+c/gi",
    validateInput: (value) => {
      const { pattern, flags } = parseRegexInput(value);
      const result = explainRegex(pattern, flags, { checkBacktracking: false });
      return result.ok ? undefined : result.message;
    },
  });
  return text ? parseRegexInput(text) : undefined;
}
