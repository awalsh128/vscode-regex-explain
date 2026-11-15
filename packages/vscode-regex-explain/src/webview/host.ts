/**
 * The extension-host side of the explanation panel: it opens and reuses the webview panel, renders
 * its page with {@link PanelTemplate}, draws the pattern's syntax tree once the regex stops
 * changing, and answers the page's match requests through a {@link RegexMatcher}. The page's own
 * script is `main.ts`, which runs in the webview.
 */
import { randomBytes } from "crypto";
import {
  describeMatches,
  explainRegex,
  regex101Url,
  RegexParser,
  RegexSource,
  syntaxTreeSvg,
} from "regex-explain";
import * as vscode from "vscode";
import { getConfig } from "../configuration";
import { RegexMatcher } from "../matcher";
import { PANEL_TITLE, PanelSyntaxTree, PanelTemplate } from "./panel";
import { isMatchMessage, MatchesMessage } from "./protocol";

/** View type of the explanation panel. */
export const VIEW_TYPE = "regexExplain.explanation";

/** The most matches the panel lists. */
const MATCH_LIMIT = 1000;

/**
 * Wait after the followed regex stops changing before drawing its syntax tree, in milliseconds, so
 * that typing in a regex does not redraw the tree at every key press.
 */
export const SYNTAX_TREE_DELAY_MS = 2000;

/**
 * Shows explanations in one webview panel beside the editor: the explanation on top, and below it a
 * text area whose matches are listed with their line numbers.
 */
export class ExplanationPanel implements vscode.Disposable {
  private readonly extensionUri: vscode.Uri;
  private readonly matcher: RegexMatcher;
  private readonly template: PanelTemplate;
  private readonly parser: RegexParser;
  private panel: vscode.WebviewPanel | undefined;
  private input: RegexSource | undefined;
  /** Cancels the match request in progress, which a newer request or closing the panel replaces. */
  private pending: AbortController | undefined;
  private syntaxTreeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Constructs a new ExplanationPanel.
   *
   * @param extensionUri The extension's directory, whose `dist/` holds the panel script and styles.
   * @param matcher Runs the regex over the text in the input pane.
   * @param template Renders the page.
   * @param parser Parses the regex into the syntax tree the page draws.
   */
  constructor(
    extensionUri: vscode.Uri,
    matcher: RegexMatcher,
    template: PanelTemplate,
    parser: RegexParser
  ) {
    this.extensionUri = extensionUri;
    this.matcher = matcher;
    this.template = template;
    this.parser = parser;
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
    this.scheduleSyntaxTree(panel, input, scope, 0);
    panel.reveal(vscode.ViewColumn.Beside, true);
  }

  /**
   * Shows a regex in the open panel when it differs from the one shown, as the user points at
   * another regex or edits this one. A closed panel stays closed, and the panel stays where the
   * user put it. The syntax tree is drawn {@link SYNTAX_TREE_DELAY_MS} after the last change.
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
    this.scheduleSyntaxTree(this.panel, input, scope, SYNTAX_TREE_DELAY_MS);
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
   * @param syntaxTree The regex's syntax tree diagram, once drawn.
   */
  private render(
    panel: vscode.WebviewPanel,
    input: RegexSource,
    scope?: vscode.ConfigurationScope,
    syntaxTree?: PanelSyntaxTree
  ): void {
    this.input = input;
    const webview = panel.webview;
    const { checkBacktracking } = getConfig(scope);
    const result = explainRegex(input.pattern, input.flags, { checkBacktracking });
    webview.html = this.template.render(
      result,
      {
        cspSource: webview.cspSource,
        nonce: randomBytes(16).toString("base64"),
        scriptUri: webview
          .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "webview.js"))
          .toString(),
        styleUri: webview
          .asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "dist", "panel.css"))
          .toString(),
      },
      syntaxTree
    );
  }

  /**
   * Draws the regex's syntax tree after a delay, replacing any drawing still waiting, so that only
   * the regex shown once changes settle is drawn.
   *
   * @param panel The panel.
   * @param input The regex.
   * @param scope The document whose language and folder settings apply, if any.
   * @param delayMs How long to wait, in milliseconds.
   */
  private scheduleSyntaxTree(
    panel: vscode.WebviewPanel,
    input: RegexSource,
    scope: vscode.ConfigurationScope | undefined,
    delayMs: number
  ): void {
    clearTimeout(this.syntaxTreeTimer);
    this.syntaxTreeTimer = setTimeout(() => void this.drawSyntaxTree(panel, input, scope), delayMs);
  }

  /**
   * Parses the regex and renders the page again with its syntax tree, unless the panel has closed
   * or moved on to another regex meanwhile. The page is rendered rather than sent the drawing, so
   * that it keeps the drawing when VS Code reloads a hidden panel.
   *
   * @param panel The panel.
   * @param input The regex.
   * @param scope The document whose language and folder settings apply, if any.
   */
  private async drawSyntaxTree(
    panel: vscode.WebviewPanel,
    input: RegexSource,
    scope: vscode.ConfigurationScope | undefined
  ): Promise<void> {
    let syntaxTree: PanelSyntaxTree;
    try {
      syntaxTree = { svg: syntaxTreeSvg(await this.parser.syntaxTree(input.pattern)) };
    } catch (error) {
      syntaxTree = { error: error instanceof Error ? error.message : String(error) };
    }
    if (this.panel === panel && this.input === input) {
      this.render(panel, input, scope, syntaxTree);
    }
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
    clearTimeout(this.syntaxTreeTimer);
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
      PANEL_TITLE,
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
      clearTimeout(this.syntaxTreeTimer);
      this.panel = undefined;
      this.input = undefined;
    });
    this.panel = panel;
    return panel;
  }
}
