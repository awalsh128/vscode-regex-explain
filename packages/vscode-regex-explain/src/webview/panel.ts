/**
 * Renders the explanation panel's page from the Mustache templates in `src/webview/`, which the
 * bundle copies to `dist/`: `panel.html` for the page and `parts.html` for description text. This
 * module only shapes the library's `ExplanationModel` into the templates' view, with regexes
 * highlighted by `highlight.ts`. It does not import `vscode`, so that it can be tested in Node; the
 * panel passes in the webview URIs.
 */
import * as fs from "fs";
import Mustache from "mustache";
import * as path from "path";
import {
  ExplainResult,
  ExplanationRenderer,
  parseRegexInput,
  regex101Url,
  RegexSource,
} from "regex-explain";
import { highlight } from "./highlight";

/** Webview-specific values the page needs. */
export interface PanelResources {
  /** The webview's `cspSource`, allowed to serve scripts and styles. */
  readonly cspSource: string;
  /** A random value that marks the page's own script as allowed. */
  readonly nonce: string;
  /** The webview URI of the bundled panel script. */
  readonly scriptUri: string;
  /** The webview URI of the panel stylesheet. */
  readonly styleUri: string;
}

/** Indentation per nesting level of the Code Point column, in `em`. */
const INDENT_EM = 1.25;

/** Renders explanation pages from the panel templates. */
export class PanelTemplate {
  private readonly page: string;
  private readonly partials: Record<string, string>;

  /**
   * Constructs a new PanelTemplate, reading the templates once.
   *
   * @param templateDir The directory holding `panel.html` and `parts.html`.
   */
  constructor(templateDir: string) {
    const read = (name: string): string => fs.readFileSync(path.join(templateDir, name), "utf8");
    this.page = read("panel.html");
    // A partial's final line break would land inside the element that includes it.
    this.partials = { parts: read("parts.html").trimEnd() };
  }

  /**
   * Renders the page for an explanation.
   *
   * @param result The explanation to show.
   * @param resources The webview URIs and nonce.
   *
   * @returns The HTML document.
   */
  render(result: ExplainResult, resources: PanelResources): string {
    const model = new ExplanationRenderer(result).model();
    const error = model.error && {
      message: model.error.message,
      caret:
        model.error.caret === undefined
          ? undefined
          : `${model.error.pattern}\n${model.error.caret}`,
    };
    const view = {
      ...resources,
      ...model,
      literalHtml: literalHtml(result),
      // The page updates the link with the input text as the user types.
      regex101Url: regex101Url(result),
      error,
      warnings: model.warnings.map((warning) => {
        const fix = warning.fix === undefined ? undefined : parseRegexInput(warning.fix);
        return { ...warning, fixHtml: fix && literalHtml(fix) };
      }),
      rows: model.rows.map((row) => ({
        ...row,
        highlightedCode: highlight(row.raw),
        indent: row.depth * INDENT_EM,
      })),
      hasFlags: model.flags.length > 0,
    };
    // Mustache passes numbers, such as the indent, to the escape function as they are.
    return Mustache.render(this.page, view, this.partials, {
      escape: (value: unknown) => escapeHtml(String(value)),
    });
  }
}

/**
 * Renders a regex as a literal with its pattern highlighted.
 *
 * @param source The regex.
 *
 * @returns HTML for `/pattern/flags`, with the slashes and flags as plain text.
 */
function literalHtml(source: RegexSource): string {
  return `/${highlight(source.pattern)}/${escapeHtml(source.flags)}`;
}

/**
 * Escapes text for use in HTML content and quoted attributes.
 *
 * @param text The text.
 *
 * @returns The escaped text.
 */
export function escapeHtml(text: string): string {
  // TODO: Use escape-html instead
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char
  );
}
