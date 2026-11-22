import {
  EXPLAIN_TITLE,
  EXPLAIN_VIEW_TYPE,
  findWebviewTab,
  openFile,
  runFromPalette,
  sleep,
  waitFor,
  xdo,
  xdoType,
} from "../helpers";
import type { Scene } from "../index";

export const commandInput: Scene = {
  name: "command-input",
  async run() {
    await openFile("sample.ts", 5, 0); // the empty last line: no selection, no regex at the cursor
    await sleep(600);
    await runFromPalette(EXPLAIN_TITLE); // so the command asks for a pattern
    await sleep(1500);
    xdoType("^[A-Z]{3}-\\d{4}$"); // the input box is not an editor, so the API cannot type into it
    await sleep(900);
    xdo("key", "Return");
    await waitFor("the explanation panel", () => findWebviewTab(EXPLAIN_VIEW_TYPE));
    await sleep(4000);
  },
};
