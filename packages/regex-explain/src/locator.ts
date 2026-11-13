/**
 * Finds regexes in source text: regex literals, and string literals passed to regex APIs such as
 * Python's `re.compile`. Parsing uses tree-sitter grammars compiled to WebAssembly, and
 * {@link LANGUAGES} lists the queries that pick out regexes in each language.
 *
 * The runtime comes from `@vscode/tree-sitter-wasm`, an optional peer dependency that is imported
 * only when a {@link RegexFinder} first loads a grammar, so the rest of the library works without
 * it.
 */
import type { Language, Node, Parser, Query, QueryCapture, Range } from "@vscode/tree-sitter-wasm";
import { LANGUAGES, LanguageSpec } from "./compiler";
import type { RegexSource } from "./explainer";
import { decodeEscape, splitDelimitedPattern, translateFlags } from "./strings";

/**
 * A regex found in source text. The pattern has the source language's string escapes decoded, and
 * the flags are translated to JavaScript.
 */
export interface LocatedRegex extends RegexSource {
  /** Offset where the regex starts, inclusive. */
  readonly start: number;
  /** Offset where the regex ends, exclusive. */
  readonly end: number;
}

/** A language ready to parse and query. */
interface LoadedLanguage {
  /** A parser using the language's grammar. */
  readonly parser: Parser;
  /** The language's compiled query. */
  readonly query: Query;
}

/**
 * Sources longer than this, in UTF-16 code units, are not parsed. Regexes in generated or minified
 * files are rarely worth explaining, and parsing them on every change would be slow.
 */
export const MAX_SCAN_LENGTH = 1_000_000;

/** Named children of string literals that hold their text rather than delimiters or code. */
const CONTENT_TYPE = /(?:content|fragment)$/;

/** Named children of string literals that delimit them. */
const DELIMITER_TYPE = /(?:_start|_end)$/;

/** `<script>` blocks of single-file components, with the code in group 1. */
const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** The tree-sitter module's exports. */
type TreeSitter = typeof import("@vscode/tree-sitter-wasm");

/**
 * Loads and initializes the tree-sitter runtime once per process, from the directory of the first
 * finder to load it successfully.
 */
let runtime: Promise<TreeSitter> | undefined;

/**
 * Loads the tree-sitter runtime and initializes its WebAssembly module.
 *
 * @param wasmDir Directory holding `tree-sitter.wasm`.
 *
 * @returns The runtime's exports.
 */
async function loadRuntime(wasmDir: string): Promise<TreeSitter> {
  const imported = await import("@vscode/tree-sitter-wasm");
  // The package is CommonJS: ES module loaders put its exports on `default`.
  const treeSitter = (imported as { default?: TreeSitter }).default ?? imported;
  await treeSitter.Parser.init({ locateFile: (file) => joinPath(wasmDir, file) });
  return treeSitter;
}

/**
 * Joins a directory and a file name with `/`, which works for file paths on every platform and for
 * URLs, so that the finder runs under bundlers without Node's `path` module.
 *
 * @param dir The directory or URL.
 * @param file The file name.
 *
 * @returns The joined path.
 */
function joinPath(dir: string, file: string): string {
  return `${dir.replace(/[\\/]+$/, "")}/${file}`;
}

/** Finds regexes in documents of the languages in {@link LANGUAGES}. */
export class RegexFinder {
  private readonly wasmDir: string;
  private readonly grammars = new Map<string, Promise<Language>>();
  private readonly languages = new Map<string, Promise<LoadedLanguage>>();

  /**
   * Constructs a new RegexFinder.
   *
   * @param wasmDir Directory or URL holding `tree-sitter.wasm` and the `tree-sitter-<grammar>.wasm`
   *   files, such as the `wasm` directory of `@vscode/tree-sitter-wasm`.
   */
  constructor(wasmDir: string) {
    this.wasmDir = wasmDir;
  }

  /**
   * Checks whether regexes can be found in a language.
   *
   * @param languageId A VS Code language ID.
   *
   * @returns Whether the language has a {@link LanguageSpec}.
   */
  supports(languageId: string): boolean {
    return Object.hasOwn(LANGUAGES, languageId);
  }

  /**
   * Lists the regexes in source text, in order.
   *
   * @param source The source text.
   * @param languageId The VS Code language ID of the source.
   *
   * @returns The regexes found; none for unsupported languages or for sources longer than
   *   {@link MAX_SCAN_LENGTH}. Patterns built at run time, such as strings with interpolations, are
   *   skipped.
   */
  async find(source: string, languageId: string): Promise<LocatedRegex[]> {
    if (source.length > MAX_SCAN_LENGTH || !this.supports(languageId)) {
      return [];
    }
    const spec = LANGUAGES[languageId];
    const { parser, query } = await this.language(languageId, spec);
    const includedRanges = spec.scriptBlocks ? scriptRanges(source) : undefined;
    if (includedRanges?.length === 0) {
      return [];
    }
    const tree = parser.parse(source, null, { includedRanges });
    if (!tree) {
      return [];
    }
    try {
      const regexes = query
        .matches(tree.rootNode)
        .flatMap((match) => readMatch(match.captures, source, spec) ?? []);
      // Patterns can match the same regex more than once; the first match at each offset wins, so
      // the map is built from the end, where later entries replace earlier ones.
      const byStart = new Map([...regexes].reverse().map((regex) => [regex.start, regex]));
      return [...byStart.values()].sort((a, b) => a.start - b.start);
    } finally {
      tree.delete();
    }
  }

  /**
   * Creates a parser and compiles the query for a language, once per language.
   *
   * @param languageId The VS Code language ID.
   * @param spec The language's entry in {@link LANGUAGES}.
   *
   * @returns The parser and query.
   */
  private language(languageId: string, spec: LanguageSpec): Promise<LoadedLanguage> {
    let loaded = this.languages.get(languageId);
    if (!loaded) {
      loaded = Promise.all([this.runtime(), this.grammar(spec.grammar)]).then(
        ([treeSitter, language]) => {
          const parser = new treeSitter.Parser();
          parser.setLanguage(language);
          return { parser, query: new treeSitter.Query(language, spec.query) };
        }
      );
      // A cache: each language's parser and query are built once and shared by later calls.
      // eslint-disable-next-line functional/immutable-data
      this.languages.set(languageId, loaded);
    }
    return loaded;
  }

  /**
   * Loads a grammar from the WASM directory, once per grammar.
   *
   * @param grammar The grammar name.
   *
   * @returns The grammar.
   */
  private grammar(grammar: string): Promise<Language> {
    let loaded = this.grammars.get(grammar);
    if (!loaded) {
      loaded = this.runtime().then((treeSitter) =>
        treeSitter.Language.load(joinPath(this.wasmDir, `tree-sitter-${grammar}.wasm`))
      );
      // A cache: each grammar's WASM file is loaded once and shared by later calls.
      // eslint-disable-next-line functional/immutable-data
      this.grammars.set(grammar, loaded);
    }
    return loaded;
  }

  /**
   * Loads the tree-sitter runtime, once per process. A failed load is not kept, so a later call,
   * possibly from a finder with a different directory, tries again.
   *
   * @returns The runtime's exports.
   */
  private runtime(): Promise<TreeSitter> {
    runtime ??= loadRuntime(this.wasmDir).catch((error: unknown) => {
      runtime = undefined;
      throw error;
    });
    return runtime;
  }
}

/**
 * Finds the regex that contains an offset.
 *
 * @param regexes Regexes from {@link RegexFinder.find}, in order.
 * @param offset The offset to look up.
 *
 * @returns The regex, or undefined if the offset is not inside one.
 */
export function findRegexAt(
  regexes: readonly LocatedRegex[],
  offset: number
): LocatedRegex | undefined {
  return regexes.find((r) => offset >= r.start && offset < r.end);
}

/**
 * Reads the pattern and flags from one query match.
 *
 * @param captures The match's captures.
 * @param source The parsed source text.
 * @param spec The language.
 *
 * @returns The regex, or undefined if its value is not known until run time.
 */
function readMatch(
  captures: readonly QueryCapture[],
  source: string,
  spec: LanguageSpec
): LocatedRegex | undefined {
  const node = (name: string): Node | undefined => captures.find((c) => c.name === name)?.node;
  const literal = node("literal");
  const delimited = node("pattern.delimited");
  const patternString = node("pattern.string");
  const flagsString = node("flags.string");
  const patternNode = node("pattern");

  let parts: RegexSource | undefined;
  if (literal) {
    parts = literalParts(literal, source);
  } else if (delimited) {
    const value = stringValue(delimited, source, spec);
    parts = value === undefined ? undefined : splitDelimitedPattern(value);
  } else if (patternString) {
    const pattern = stringValue(patternString, source, spec);
    const flags = flagsString ? stringValue(flagsString, source, spec) : "";
    parts = pattern === undefined || flags === undefined ? undefined : { pattern, flags };
  } else if (patternNode) {
    parts = { pattern: patternNode.text, flags: node("flags")?.text ?? "" };
  }

  const range = node("regex") ?? literal ?? delimited ?? patternString ?? patternNode;
  if (!parts || !range) {
    return undefined;
  }
  return {
    pattern: parts.pattern,
    flags: translateFlags(parts.flags, spec.flags ?? {}),
    start: range.startIndex,
    end: range.endIndex,
  };
}

/**
 * Splits a regex literal into the source text between its delimiters and the flags after them.
 *
 * @param node A `@literal` capture.
 * @param source The parsed source text.
 *
 * @returns The parts, or undefined if the literal interpolates code.
 */
function literalParts(node: Node, source: string): RegexSource | undefined {
  const open = node.firstChild;
  const close = node.lastChild;
  if (!open || !close || open.startIndex === close.startIndex || node.namedChildren.some(isCode)) {
    return undefined;
  }
  return {
    pattern: source.slice(open.endIndex, close.startIndex),
    flags: close.text.slice(1),
  };
}

/**
 * Computes the value of a string literal, decoding its escapes.
 *
 * @param node A string literal node.
 * @param source The parsed source text.
 * @param spec The language, for its escapes.
 *
 * @returns The value, or undefined if the string interpolates code or has an escape that cannot be
 *   decoded.
 */
function stringValue(node: Node, source: string, spec: LanguageSpec): string | undefined {
  if (node.childCount === 0) {
    return verbatimValue(node.text);
  }
  let value = "";
  for (const child of node.children) {
    if (!child || !child.isNamed || DELIMITER_TYPE.test(child.type)) {
      continue;
    }
    const piece =
      child.type === "escape_sequence"
        ? decodeEscape(child.text, spec.escapes)
        : CONTENT_TYPE.test(child.type)
          ? contentValue(child, source, spec)
          : undefined;
    if (piece === undefined) {
      return undefined;
    }
    value += piece;
  }
  return value;
}

/**
 * Computes the value of a string content node, some of which, as in Python, contain the escapes.
 *
 * @param node The content node.
 * @param source The parsed source text.
 * @param spec The language, for its escapes.
 *
 * @returns The value, or undefined if an escape cannot be decoded.
 */
function contentValue(node: Node, source: string, spec: LanguageSpec): string | undefined {
  let value = "";
  let offset = node.startIndex;
  for (const escape of node.descendantsOfType("escape_sequence")) {
    const decoded = escape ? decodeEscape(escape.text, spec.escapes) : undefined;
    if (!escape || decoded === undefined) {
      return undefined;
    }
    value += source.slice(offset, escape.startIndex) + decoded;
    offset = escape.endIndex;
  }
  return value + source.slice(offset, node.endIndex);
}

/**
 * Computes the value of a string literal that the grammar does not split into parts, such as C#'s
 * `@"..."`, where a doubled quote stands for one quote.
 *
 * @param text The literal's source text.
 *
 * @returns The value, or undefined if the text is not a quoted string.
 */
function verbatimValue(text: string): string | undefined {
  const quoted = /^[^"'`]*(["'`])([\s\S]*)\1$/.exec(text);
  return quoted ? quoted[2].replaceAll(quoted[1] + quoted[1], quoted[1]) : undefined;
}

/**
 * Checks whether a child of a literal is code, such as an interpolation, rather than text.
 *
 * @param node A named child.
 *
 * @returns Whether the node is neither text, an escape, nor a delimiter.
 */
function isCode(node: Node | null): boolean {
  return (
    !!node &&
    node.type !== "escape_sequence" &&
    !CONTENT_TYPE.test(node.type) &&
    !DELIMITER_TYPE.test(node.type)
  );
}

/**
 * Lists the `<script>` blocks of a single-file component as parser ranges.
 *
 * @param source The component's source text.
 *
 * @returns One range per block, covering the code between the tags.
 */
function scriptRanges(source: string): Range[] {
  return [...source.matchAll(SCRIPT_BLOCK)].map((block) => {
    const startIndex = (block.index ?? 0) + block[0].indexOf(">") + 1;
    const endIndex = startIndex + block[1].length;
    return {
      startIndex,
      endIndex,
      startPosition: pointAt(source, startIndex),
      endPosition: pointAt(source, endIndex),
    };
  });
}

/**
 * Converts an offset to a row and column.
 *
 * @param source The text.
 * @param offset The offset.
 *
 * @returns The zero-based row and column.
 */
function pointAt(source: string, offset: number): { row: number; column: number } {
  const before = source.slice(0, offset);
  const lineStart = before.lastIndexOf("\n") + 1;
  return { row: before.split("\n").length - 1, column: offset - lineStart };
}
