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

const VIEW_TYPE = "regexExplain.explanation";

export const panelFollow: Scene = {
  name: "panel-follow",
  async run() {
    const editor = await openFile("sample.ts", 1, 40);
    await sleep(800);
    await runFromPalette(EXPLAIN_TITLE);
    await waitFor("the explanation panel", () => findWebviewTab(VIEW_TYPE));
    await sleep(3500); // the diagram paints in the webview; confirmed by frame
    await vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn,
      preserveFocus: false,
    });
    placeCursor(editor, 2, 40); // the phone regex: the panel follows after its 200 ms delay
    await sleep(3500);
    placeCursor(editor, 3, 24); // the slow regex
    await sleep(3500);
  },
};
