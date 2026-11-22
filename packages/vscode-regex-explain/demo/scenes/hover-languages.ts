import { openFile, run, showRegexHoverAt, sleep } from "../helpers";
import type { Scene } from "../index";

/** One regex per language family, each found by parsing the file, not by a pattern shown. */
const FILES = ["zip.go", "zip.rs", "Zip.java", "Zip.cs", "zip.rb", "zip.php"];

export const hoverLanguages: Scene = {
  name: "hover-languages",
  async run() {
    for (const [index, file] of FILES.entries()) {
      const editor = await openFile(file);
      await showRegexHoverAt(editor, "\\d{5}", 3);
      await sleep(2200);
      if (index < FILES.length - 1) {
        await run("editor.action.hideHover"); // the last hover stays up for the closing hold
        await sleep(300);
      }
    }
  },
};
