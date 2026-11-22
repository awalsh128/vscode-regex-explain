import { openFile, showRegexHover, sleep } from "../helpers";
import type { Scene } from "../index";

export const hoverPython: Scene = {
  name: "hover-python",
  async run() {
    const editor = await openFile("dates.py");
    await showRegexHover(editor, 2, 26); // inside the string passed to re.compile
    await sleep(4000);
  },
};
