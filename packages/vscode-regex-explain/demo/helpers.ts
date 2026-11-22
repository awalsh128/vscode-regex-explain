import * as vscode from "vscode";

export const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls until `probe` returns something other than undefined. Use it for anything asynchronous. */
export async function waitFor<T>(
  what: string,
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 15_000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }

    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }

    await sleep(100);
  }
}

export const run = (id: string, ...args: unknown[]): Thenable<unknown> =>
  vscode.commands.executeCommand(id, ...args);

export const workspaceUri = (relative: string): vscode.Uri =>
  vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relative);

export async function openFile(
  relative: string,
  line = 0,
  character = 0
): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument(workspaceUri(relative));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  placeCursor(editor, line, character);
  return editor;
}

export function placeCursor(editor: vscode.TextEditor, line: number, character: number): void {
  const position = new vscode.Position(line, character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

/** Types one character at a time through the editor's own `type` command. */
export async function typeText(text: string, delayMs = 60): Promise<void> {
  for (const character of text) {
    await run("type", { text: character });
    await sleep(delayMs);
  }
}

/** Runs a command the way a user does: through the palette, with its title typed in. */
export async function runFromPalette(title: string): Promise<void> {
  await run("workbench.action.quickOpen", `>${title}`);
  await sleep(1200);
  await run("workbench.action.acceptSelectedQuickOpenItem");
}

/** Finds an open webview panel by the view type the extension passes to createWebviewPanel. */
export function findWebviewTab(viewType: string): vscode.Tab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes(viewType)
    );
}

export const EXPLAIN_TITLE = "Regex Explain: Explain Regex";

/** Text only this extension's hovers contain; other providers' hovers are ignored. */
const HOVER_MARKER = "Open explanation";

export async function regexHovers(uri: vscode.Uri, position: vscode.Position): Promise<string[]> {
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    uri,
    position
  );
  return hovers
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .filter((value) => value.includes(HOVER_MARKER));
}

/** Shows the hover at the cursor, as a user rests the mouse, after asserting it exists. */
export async function showRegexHover(
  editor: vscode.TextEditor,
  line: number,
  character: number
): Promise<string> {
  placeCursor(editor, line, character);
  const [hover] = await waitFor("a Regex Explain hover", async () => {
    const found = await regexHovers(editor.document.uri, new vscode.Position(line, character));
    return found.length ? found : undefined;
  });
  await run("editor.action.showHover");
  return hover;
}

/**
 * Like showRegexHover, but finds the position from text in the file, so the scene survives edits to
 * it.
 */
export async function showRegexHoverAt(
  editor: vscode.TextEditor,
  marker: string,
  offset = 2
): Promise<string> {
  const index = editor.document.getText().indexOf(marker);
  if (index < 0) {
    throw new Error(`"${marker}" is not in ${editor.document.fileName}`);
  }
  const position = editor.document.positionAt(index + offset);
  return showRegexHover(editor, position.line, position.character);
}

import { execFileSync } from "node:child_process";

/** Drives what the API cannot (native menus, input boxes, webview DOM) with real X11 input. */
export function xdo(...args: string[]): void {
  execFileSync("xdotool", args, { stdio: "ignore" });
}

/** Types into whatever has keyboard focus, one key at a time. */
export function xdoType(text: string, delayMs = 90): void {
  xdo("type", "--delay", String(delayMs), "--", text);
}

export const EXPLAIN_VIEW_TYPE = "regexExplain.explanation";
