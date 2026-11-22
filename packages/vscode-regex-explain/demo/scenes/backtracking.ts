import { openFile, showRegexHover, sleep } from "../helpers";
import type { Scene } from "../index";

export const backtracking: Scene = {
  name: "backtracking",
  async run() {
    const editor = await openFile("sample.ts");
    const hover = await showRegexHover(editor, 3, 24); // /^(a+)+$/
    if (!/warning/i.test(hover)) {
      throw new Error("no backtracking warning in the hover");
    }
    await sleep(5000);
  },
};
