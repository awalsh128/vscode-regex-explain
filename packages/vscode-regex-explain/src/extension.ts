import * as path from "path";
import { RegexFinder, RegexParser } from "regex-explain";
import * as vscode from "vscode";
import { EXPLAIN_COMMAND, ExplainCommandHandler } from "./explain";
import { PanelFollower } from "./follow";
import { RegexHoverProvider } from "./hover";
import { RegexMatcher } from "./matcher";
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
  const wasmDir = path.join(context.extensionPath, "dist");
  const locator = new RegexLocator(new RegexFinder(wasmDir));
  const matcher = new RegexMatcher(path.join(context.extensionPath, "dist", "matchWorker.js"));
  const template = new PanelTemplate(path.join(context.extensionPath, "dist"));
  const panel = new ExplanationPanel(
    context.extensionUri,
    matcher,
    template,
    new RegexParser(wasmDir)
  );
  const command = new ExplainCommandHandler(locator, panel);
  context.subscriptions.push(
    panel,
    new PanelFollower(locator, panel),
    // Selections are explained in every language; the provider checks for regexes by language.
    vscode.languages.registerHoverProvider({ scheme: "*" }, new RegexHoverProvider(locator, panel)),
    vscode.commands.registerCommand(EXPLAIN_COMMAND, (arg?: unknown) => command.execute(arg))
  );
}
