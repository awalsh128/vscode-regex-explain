import type { Scene } from "../index";
import { backtracking } from "./backtracking";
import { backtrackingSetting } from "./backtracking-setting";
import { commandInput } from "./command-input";
import { contextMenu } from "./context-menu";
import { followOff } from "./follow-off";
import { hoverLanguages } from "./hover-languages";
import { hoverLiteral } from "./hover-literal";
import { hoverPython } from "./hover-python";
import { hoverSetting } from "./hover-setting";
import { languageOverride } from "./language-override";
import { panelFollow } from "./panel-follow";
import { panelMatch } from "./panel-match";
import { selection } from "./selection";

export const scenes: Scene[] = [
  hoverLiteral,
  hoverPython,
  selection,
  backtracking,
  panelFollow,
  hoverSetting,
  hoverLanguages,
  backtrackingSetting,
  followOff,
  languageOverride,
  contextMenu,
  commandInput,
  panelMatch,
];
