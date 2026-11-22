import * as vscode from "vscode";
import { openFile, regexHovers, run, showRegexHoverAt, sleep, waitFor } from "../helpers";
import type { Scene } from "../index";

export const backtrackingSetting: Scene = {
  name: "backtracking-setting",
  async run() {
    const editor = await openFile("sample.ts");
    const uri = editor.document.uri;
    const hover = await showRegexHoverAt(editor, "(a+)+", 3);
    if (!/warning/i.test(hover)) {
      throw new Error("no warning with checkBacktracking on");
    }
    await sleep(2500);
    await vscode.workspace
      .getConfiguration("regexExplain")
      .update("checkBacktracking", false, vscode.ConfigurationTarget.Global);
    const position = editor.selection.active;
    await waitFor("the warning to go away", async () => {
      const found = await regexHovers(uri, position);
      return found.length && !/warning/i.test(found.join("\n")) ? true : undefined;
    });
    await run("editor.action.hideHover");
    await sleep(600);
    await run("editor.action.showHover");
    await sleep(3000); // the explanation stays, the warning is gone
  },
};
