import { openFile, showRegexHover, sleep } from "../helpers";
import type { Scene } from "../index";

export const hoverLiteral: Scene = {
  name: "hover-literal",
  async run() {
    const editor = await openFile("sample.ts");
    const hover = await showRegexHover(editor, 4, 30);
    if (!new RegExp("0-9|hexadecimal|Match one of").test(hover)) {
      throw new Error("hover does not explain the capture group");
    }
    await sleep(4000);
  },
};
