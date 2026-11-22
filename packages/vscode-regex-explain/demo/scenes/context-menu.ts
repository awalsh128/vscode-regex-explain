import { EXPLAIN_VIEW_TYPE, findWebviewTab, openFile, run, sleep, waitFor, xdo } from "../helpers";
import type { Scene } from "../index";

// The editor context menu is native: the API opens it but cannot choose an item, so xdotool clicks.
// The coordinates are stable because the window size, zoom and layout are fixed by the profile.
const ITEM = { x: 570, y: 212 }; // "Regex Explain: Explain Regex"

export const contextMenu: Scene = {
  name: "context-menu",
  async run() {
    await openFile("sample.ts", 4, 30);
    await sleep(600);
    await run("editor.action.showContextMenu");
    await sleep(1800);
    xdo("mousemove", String(ITEM.x), String(ITEM.y));
    await sleep(900);
    xdo("click", "1");
    await waitFor("the explanation panel", () => findWebviewTab(EXPLAIN_VIEW_TYPE));
    xdo("mousemove", "940", "2"); // pointer back out of the shot
    await sleep(4000);
  },
};
