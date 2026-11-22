import * as vscode from "vscode";
import { openFile, regexHovers, run, showRegexHover, sleep, waitFor } from "../helpers";
import type { Scene } from "../index";

const config = (): vscode.WorkspaceConfiguration =>
  vscode.workspace.getConfiguration("regexExplain");

export const hoverSetting: Scene = {
  name: "hover-setting",
  async run() {
    const editor = await openFile("sample.ts");
    const uri = editor.document.uri;
    await showRegexHover(editor, 4, 30);
    await sleep(2500);
    await config().update("hover.enabled", false, vscode.ConfigurationTarget.Global);
    await waitFor("the hover to go away", async () =>
      (await regexHovers(uri, new vscode.Position(4, 30))).length === 0 ? true : undefined
    );
    await run("editor.action.hideHover"); // the open widget would otherwise stay on screen
    await sleep(800);
    await run("editor.action.showHover");
    await sleep(2500); // nothing from Regex Explain appears
    await config().update("hover.enabled", undefined, vscode.ConfigurationTarget.Global);
    await showRegexHover(editor, 4, 30);
    await sleep(2500);
  },
};
