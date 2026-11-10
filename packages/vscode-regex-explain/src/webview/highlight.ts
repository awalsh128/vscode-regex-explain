/**
 * Syntax-highlights regex patterns for the explanation panel with Shiki, in VS Code's Light+ and
 * Dark+ themes. It runs in the extension host while `panel.ts` renders the page, so it cannot see
 * the webview's theme: each token carries both themes' colors as the `--shiki-light` and
 * `--shiki-dark` CSS variables, and `panel.css` picks one from the webview's theme class.
 */
import { createHighlighterCoreSync, HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import regexp from "shiki/langs/regexp.mjs";
import darkPlus from "shiki/themes/dark-plus.mjs";
import lightPlus from "shiki/themes/light-plus.mjs";

/** The themes each token is colored in, keyed by the CSS variable suffix Shiki writes. */
const THEMES = { light: "light-plus", dark: "dark-plus" } as const;

/** Created on first use; the synchronous core with the JavaScript engine needs no WebAssembly. */
let highlighter: HighlighterCore | undefined;

/**
 * Highlights a regex pattern, or a piece of one, with the TextMate `regexp` grammar.
 *
 * @param pattern The pattern without slashes or flags, such as an explanation row's `raw`.
 *
 * @returns HTML spans with the text escaped and each token's colors in `style` variables, for use
 *   inside an element with the `regex` class.
 */
export function highlight(pattern: string): string {
  highlighter ??= createHighlighterCoreSync({
    themes: [lightPlus, darkPlus],
    langs: [regexp],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter.codeToHtml(pattern, {
    lang: "regexp",
    themes: THEMES,
    defaultColor: false,
    structure: "inline",
  });
}
