/**
 * The extension-host side of the explanation panel: it opens and reuses the webview panel, renders
 * its page with {@link PanelTemplate}, and answers the page's match requests through a
 * {@link RegexMatcher}. The page's own script is `main.ts`, which runs in the webview.
 */
import { randomBytes } from "crypto";
import { describeMatches, explainRegex, regex101Url, RegexSource } from "regex-explain";
import * as vscode from "vscode";
import { getConfig } from "../configuration";
import { RegexMatcher } from "../matcher";
import { PanelTemplate } from "./panel";
import { isMatchMessage, MatchesMessage } from "./protocol";

/** View type of the explanation panel. */
export const VIEW_TYPE = "regexExplain.explanation";

/** The most matches the panel lists. */
const MATCH_LIMIT = 1000;

/**
 * Shows explanations in one webview panel beside the editor: the explanation on top, and below it a
 * text area whose matches are listed with their line numbers.
 */
export class ExplanationPanel implements vscode.Disposable {
  private readonly extensionUri: vscode.Uri;
  private readonly matcher: RegexMatcher;
  private readonly template: PanelTemplate;
  private panel: vscode.WebviewPanel | undefined;
  private input: RegexSource | undefined;
  /** Cancels the match request in progress, which a newer request or closing the panel replaces. */
  private pending: AbortController | undefined;

  /**
   * Constructs a new ExplanationPanel.
   *
   * @param extensionUri The extension's directory, whose `dist/` holds the panel script and styles.
   * @param matcher Runs the regex over the text in the input pane.
   * @param template Renders the page.
   */
  constructor(extensionUri: vscode.Uri, matcher: RegexMatcher, template: PanelTemplate) {
    this.extensionUri = extensionUri;
    this.matcher = matcher;
    this.template = template;
  }

  /**
   * Shows a regex's explanation, opening the panel or reusing the open one. Text in the input pane
   * is kept and matched against the new regex.
   *
   * @param input The regex.
   * @param scope The document whose language and folder settings apply, if any.
   */
  show(input: RegexSource, scope?: vscode.ConfigurationScope): void {
    const panel = this.panel ?? this.create();
    this.render(panel, input, scope);
    panel.reveal(vscode.ViewColumn.Beside, true);
  }

  /**
   * Shows a regex in the open panel when it differs from the one shown, as the user points at
   * another regex or edits this one. A closed panel stays closed, and the panel stays where the
   * user put it.
   *
   * @param input The regex.
   * @param scope The document whose language and folder settings apply, if any.
   *
   * @returns Whether the panel changed.
   */
  follow(input: RegexSource, scope?: vscode.ConfigurationScope): boolean {
    const same = this.input?.pattern === input.pattern && this.input.flags === input.flags;
    if (!this.panel || same) {
      return false;
    }
    this.render(this.panel, input, scope);
    return true;
  }

  /** The regex the panel shows, or undefined when it is closed. */
  get shown(): RegexSource | undefined {
    return this.input;
  }

  /**
   * Sets the panel's page to a regex's explanation. Text in the input pane is kept and matched
   * against the new regex.
   *
   * @param panel The panel.
   * @param input The regex.
   * @param scope The document whose language and folder settings apply, if any.
   */
  private render(
    panel: vscode.WebviewPanel,
    input: RegexSource,
    scope?: vscode.ConfigurationScope
  ): void {
    this.input = input;
    const webview = panel.webview;
    const { checkBacktracking } = getConfig(scope);
    const result = explainRegex(input.pattern, input.flags, { checkBacktracking });
    webview.html = this.template.render(result, {
      cspSource: webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      scriptUri: webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"))
        .toString(),
      styleUri: webview
        .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "panel.css"))
        .toString(),
    });
  }

  /**
   * Answers a message from the webview.
   *
   * @param message The message.
   *
   * @returns The reply, or undefined for messages that need none, arrive with no regex shown, or
   *   are superseded by a newer request before they finish, which also stops their matching.
   */
  async respond(message: unknown): Promise<MatchesMessage | undefined> {
    if (!isMatchMessage(message) || !this.input) {
      return undefined;
    }
    const { pattern, flags } = this.input;
    this.pending?.abort();
    const pending = new AbortController();
    this.pending = pending;
    const request = {
      pattern,
      flags,
      text: message.text,
      limit: MATCH_LIMIT,
      entries: message.entries,
    };
    const response = await this.matcher.match(request, pending.signal).catch((error: unknown) => {
      if (pending.signal.aborted) {
        return undefined;
      }
      throw error;
    });
    if (!response) {
      return undefined;
    }
    return {
      type: "matches",
      id: message.id,
      model: describeMatches(response),
      regex101Url: regex101Url({ pattern, flags }, message.text),
    };
  }

  /** Closes the panel. */
  dispose(): void {
    this.panel?.dispose();
  }

  /**
   * Opens the panel and connects its messages.
   *
   * @returns The panel.
   */
  private create(): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "Regex Explanation",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
      }
    );
    panel.webview.onDidReceiveMessage(async (message: unknown) => {
      const reply = await this.respond(message);
      if (reply) {
        await panel.webview.postMessage(reply);
      }
    });
    panel.onDidDispose(() => {
      this.pending?.abort();
      this.panel = undefined;
      this.input = undefined;
    });
    this.panel = panel;
    return panel;
  }
}
