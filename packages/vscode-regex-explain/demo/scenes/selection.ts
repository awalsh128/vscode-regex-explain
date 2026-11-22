import * as vscode from "vscode";
import { openFile, run, sleep, waitFor } from "../helpers";
import { regexHovers } from "../helpers";
import type { Scene } from "../index";

export const selection: Scene = {
  name: "selection",
  async run() {
    const editor = await openFile("notes.txt");
    const line = editor.document.lineAt(1);
    editor.selection = new vscode.Selection(line.range.start, line.range.end);
    const middle = new vscode.Position(1, 6);
    await waitFor("a hover for the selection", async () => {
      const found = await regexHovers(editor.document.uri, middle);
      return found.length ? found : undefined;
    });
    await sleep(800);
    await run("editor.action.showHover");
    await sleep(4000);
  },
};
