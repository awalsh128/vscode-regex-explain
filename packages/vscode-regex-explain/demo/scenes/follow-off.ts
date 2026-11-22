import * as vscode from "vscode";
import {
  EXPLAIN_TITLE,
  findWebviewTab,
  openFile,
  placeCursor,
  runFromPalette,
  sleep,
  waitFor,
} from "../helpers";
import type { Scene } from "../index";

export const followOff: Scene = {
  name: "follow-off",
  async run() {
    const editor = await openFile("sample.ts", 3, 24); // the slow regex
    await sleep(600);
    await runFromPalette(EXPLAIN_TITLE);
    await waitFor("the explanation panel", () => findWebviewTab("regexExplain.explanation"));
    await sleep(3000);
    await vscode.workspace
      .getConfiguration("regexExplain")
      .update("panel.follow", false, vscode.ConfigurationTarget.Global);
    await vscode.window.showTextDocument(editor.document, { viewColumn: editor.viewColumn });
    placeCursor(editor, 2, 40); // another regex: with follow off the panel keeps the first one
    await sleep(4000);
  },
};
