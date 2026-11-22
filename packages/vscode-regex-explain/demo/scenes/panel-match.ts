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

// Webview DOM is out of the API's reach: scroll to the Input pane and type into it with xdotool.
const INPUT = { x: 720, y: 170 };

export const panelMatch: Scene = {
  name: "panel-match",
  async run() {
    await openFile("sample.ts", 4, 30); // the hex colour regex
    await sleep(600);
    await runFromPalette(EXPLAIN_TITLE);
    await waitFor("the explanation panel", () => findWebviewTab(EXPLAIN_VIEW_TYPE));
    await sleep(2500);
    xdo("mousemove", "720", "300");
    for (let i = 0; i < 4; i++) {
      xdo("click", "5"); // scroll the panel down to the Input pane
      await sleep(150);
    }
    await sleep(1200);
    xdo("mousemove", String(INPUT.x), String(INPUT.y));
    xdo("click", "1");
    await sleep(500);
    xdoType("#c0ffee");
    xdo("mousemove", "940", "2");
    await sleep(4000);
  },
};
