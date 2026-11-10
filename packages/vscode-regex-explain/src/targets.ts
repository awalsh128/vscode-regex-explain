/** Works out which regex the user is pointing at: a selection or a regex under the cursor. */
import {
  findRegexAt,
  LocatedRegex,
  parseRegexInput,
  RegexFinder,
  RegexSource,
} from "regex-explain";
import * as vscode from "vscode";
import { getConfig } from "./configuration";

/** A regex and where it is in a document. */
export interface RegexTarget {
  /** The regex. */
  readonly input: RegexSource;
  /** The document range it came from. */
  readonly range: vscode.Range;
}

/** Regexes found in a text document version (i.e. snapshot). */
export interface TextDocumentRegexes {
  /** Version of the document. */
  readonly version: number;
  /** Located regexes found in the document */
  readonly regexes: Promise<LocatedRegex[]>;
}

/** Finds regexes in documents, caching the regexes of each document version. */
export class RegexLocator {
  private readonly finder: RegexFinder;
  private readonly cache = new WeakMap<vscode.TextDocument, TextDocumentRegexes>();

  /**
   * Constructs a new RegexLocator.
   *
   * @param finder Parses documents for regexes.
   */
  constructor(finder: RegexFinder) {
    this.finder = finder;
  }

  /**
   * Returns the non-empty selection that contains a position.
   *
   * @param editor The editor whose selections to check.
   * @param position The position.
   *
   * @returns The selected regex, or undefined if the position is not in a selection.
   */
  selectionAt(editor: vscode.TextEditor, position: vscode.Position): RegexTarget | undefined {
    const selection = editor.selections.find((s) => !s.isEmpty && s.contains(position));
    if (!selection) {
      return undefined;
    }
    return { input: parseRegexInput(editor.document.getText(selection)), range: selection };
  }

  /**
   * Returns the regex at a position, in languages where regexes are found automatically.
   *
   * @param document The document.
   * @param position The position.
   *
   * @returns The regex, or undefined if there is none or the language is not enabled.
   */
  async regexAt(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<RegexTarget | undefined> {
    if (!getConfig(document).hoverLanguages.includes(document.languageId)) {
      return undefined;
    }
    const regex = findRegexAt(await this.regexes(document), document.offsetAt(position));
    if (!regex) {
      return undefined;
    }
    return {
      input: { pattern: regex.pattern, flags: regex.flags },
      range: new vscode.Range(document.positionAt(regex.start), document.positionAt(regex.end)),
    };
  }

  /**
   * Returns the regex the user is pointing at in an editor: the selection containing the position,
   * else the regex under it.
   *
   * @param editor The editor.
   * @param position The position; defaults to the cursor.
   *
   * @returns The regex, or undefined.
   */
  async targetAt(
    editor: vscode.TextEditor,
    position: vscode.Position = editor.selection.active
  ): Promise<RegexTarget | undefined> {
    return this.selectionAt(editor, position) ?? (await this.regexAt(editor.document, position));
  }

  /**
   * Returns the regexes in a document, parsing only when the document has changed.
   *
   * @param document The document.
   *
   * @returns The regexes; the finder skips documents that are too large to scan.
   */
  private regexes(document: vscode.TextDocument): Promise<LocatedRegex[]> {
    const cached = this.cache.get(document);
    if (cached?.version === document.version) {
      return cached.regexes;
    }
    const regexes = this.finder.find(document.getText(), document.languageId);
    this.cache.set(document, { version: document.version, regexes });
    return regexes;
  }
}
