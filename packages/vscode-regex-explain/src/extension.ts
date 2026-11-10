import * as path from "path";
import { RegexFinder } from "regex-explain";
import * as vscode from "vscode";
import { PanelFollower } from "./follow";
import { RegexHoverProvider } from "./hover";
import { RegexMatcher } from "./matcher";
import { EXPLAIN_COMMAND, ExplainCommandHandler } from "./preview";
import { RegexLocator } from "./targets";
import { ExplanationPanel } from "./webview/host";
import { PanelTemplate } from "./webview/panel";

/**
 * Registers the hover provider, the explain command, the explanation panel, and the follower that
 * keeps the panel on the regex at the cursor.
 *
 * @param context The extension context that owns the registrations.
 */
export function activate(context: vscode.ExtensionContext): void {
  // The bundle script copies the tree-sitter runtime and grammars next to the bundle.
  const locator = new RegexLocator(new RegexFinder(path.join(context.extensionPath, "dist")));
  const matcher = new RegexMatcher(path.join(context.extensionPath, "dist", "matchWorker.js"));
  const template = new PanelTemplate(path.join(context.extensionPath, "dist"));
  const panel = new ExplanationPanel(context.extensionUri, matcher, template);
  const command = new ExplainCommandHandler(locator, panel);
  context.subscriptions.push(
    panel,
    new PanelFollower(locator, panel),
    // Selections are explained in every language; the provider checks for regexes by language.
    vscode.languages.registerHoverProvider({ scheme: "*" }, new RegexHoverProvider(locator, panel)),
    vscode.commands.registerCommand(EXPLAIN_COMMAND, (arg?: unknown) => command.execute(arg))
  );
}
