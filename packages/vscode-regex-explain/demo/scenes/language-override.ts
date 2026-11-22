import * as vscode from "vscode";
import { openFile, regexHovers, run, showRegexHoverAt, sleep, waitFor } from "../helpers";
import type { Scene } from "../index";

export const languageOverride: Scene = {
  name: "language-override",
  languages: ["python"],
  async run() {
    let editor = await openFile("dates.py");
    await showRegexHoverAt(editor, "\\d{4}", 3);
    await sleep(2200);
    // The same as a `"[python]": { "regexExplain.hover.enabled": false }` block in settings.json.
    await vscode.workspace
      .getConfiguration("regexExplain", { languageId: "python" })
      .update("hover.enabled", false, vscode.ConfigurationTarget.Global, true);
    const position = editor.selection.active;
    await waitFor("the Python hover to go away", async () =>
      (await regexHovers(editor.document.uri, position)).length === 0 ? true : undefined
    );
    await run("editor.action.hideHover");
    await sleep(500);
    await run("editor.action.showHover");
    await sleep(2200); // nothing in Python
    editor = await openFile("sample.ts");
    await showRegexHoverAt(editor, "{6}", 1); // still works in TypeScript
    await sleep(2500);
  },
};
