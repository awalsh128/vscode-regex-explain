/**
 * Syntax and grammars. `LANGUAGES` lists where regexes appear in each supported language, as
 * tree-sitter queries over the grammars in `@vscode/tree-sitter-wasm`. `GrammarLoader` loads the
 * tree-sitter runtime and those grammars, and {@link RegexParser} parses a pattern itself with the
 * `regex` grammar. To add a language, add an entry to `LANGUAGES`; the locator and the bundle
 * script read that table.
 *
 * The runtime comes from `@vscode/tree-sitter-wasm`, an optional peer dependency that is imported
 * only when a grammar is first loaded, so the rest of the library works without it.
 *
 * Capture names tell the locator how to read a match:
 *
 * - `@regex`: the whole regex expression. The hover covers it; without it, the hover covers the
 *   pattern capture.
 * - `@pattern` and `@flags`: nodes whose source text is the pattern or flags as written.
 * - `@literal`: a regex literal whose first and last children are its delimiters, with the flags
 *   after the closing delimiter, such as Ruby's `/a+/i` or `%r{a+}i`.
 * - `@pattern.string` and `@flags.string`: string literals whose values are the pattern or flags.
 * - `@pattern.delimited`: a string literal whose value is a delimited pattern such as `/a+/i`.
 *
 * Captures starting with `_` exist only for predicates.
 */
import type { Language, Node, Parser } from "@vscode/tree-sitter-wasm";

/** How to find regexes in one language. */
export interface LanguageSpec {
  /** The grammar, loaded from `tree-sitter-<grammar>.wasm`. */
  readonly grammar: string;
  /** A tree-sitter query using the capture names described in this module. */
  readonly query: string;
  /** Flags that mean something else in JavaScript, for `translateFlags`. */
  readonly flags?: Readonly<Record<string, string>>;
  /** String escapes that mean something else in JavaScript, for `decodeEscape`. */
  readonly escapes?: Readonly<Record<string, string>>;
  /**
   * String literals, matched by their source text, whose grammar leaves the escapes of
   * `singleQuotedValue` undecoded, such as Ruby's `'...'` and `%q(...)`.
   */
  readonly singleQuoted?: RegExp;
  /** Parse only the `<script>` blocks, for single-file component formats. */
  readonly scriptBlocks?: boolean;
}

/** JavaScript string literals, with or without template syntax. */
const JS_STRING = "[(string) (template_string)]";

/** Regex literals and `RegExp` constructor calls, shared by the JavaScript-family grammars. */
const JS_QUERY = `
(regex pattern: (regex_pattern) @pattern flags: (regex_flags)? @flags) @regex
(new_expression
  constructor: (identifier) @_constructor
  arguments: (arguments . ${JS_STRING} @pattern.string . ${JS_STRING}? @flags.string)
  (#eq? @_constructor "RegExp"))
(call_expression
  function: (identifier) @_constructor
  arguments: (arguments . ${JS_STRING} @pattern.string . ${JS_STRING}? @flags.string)
  (#eq? @_constructor "RegExp"))
`;

/** C# string literals that hold a pattern on one line. */
const CS_STRING = "[(string_literal) (verbatim_string_literal) (raw_string_literal)]";

/** Ruby flags: `m` is JavaScript's `s`; `o` and the encoding flags do not change what matches. */
const RUBY_FLAGS = { m: "s", o: "", n: "", e: "", s: "", u: "" };

/**
 * PHP (PCRE) flags: `u` and `S` do not change what matches for patterns JavaScript can parse.
 * Others, such as `x`, are kept so that the explainer reports them.
 */
const PHP_FLAGS = { u: "", S: "" };

/** Supported languages, keyed by VS Code language ID. */
export const LANGUAGES: Readonly<Record<string, LanguageSpec>> = {
  javascript: { grammar: "javascript", query: JS_QUERY },
  javascriptreact: { grammar: "javascript", query: JS_QUERY },
  typescript: { grammar: "typescript", query: JS_QUERY },
  typescriptreact: { grammar: "tsx", query: JS_QUERY },
  vue: { grammar: "typescript", query: JS_QUERY, scriptBlocks: true },
  svelte: { grammar: "typescript", query: JS_QUERY, scriptBlocks: true },
  python: {
    grammar: "python",
    query: `
(call
  function: (attribute object: (identifier) @_module attribute: (identifier) @_function)
  arguments: (argument_list . (string) @pattern.string)
  (#any-of? @_module "re" "regex")
  (#any-of? @_function
    "compile" "search" "match" "fullmatch" "split" "findall" "finditer" "sub" "subn"))
`,
  },
  go: {
    grammar: "go",
    query: `
(call_expression
  function: (selector_expression operand: (identifier) @_package field: (field_identifier) @_function)
  arguments: (argument_list
    . [(raw_string_literal) (interpreted_string_literal)] @pattern.string)
  (#eq? @_package "regexp")
  (#any-of? @_function
    "Compile" "CompilePOSIX" "MustCompile" "MustCompilePOSIX" "Match" "MatchReader" "MatchString"))
`,
  },
  rust: {
    grammar: "rust",
    query: `
(call_expression
  function: (scoped_identifier path: (_) @_type name: (identifier) @_function)
  arguments: (arguments . [(string_literal) (raw_string_literal)] @pattern.string)
  (#match? @_type "(^|::)(Regex|RegexBuilder)$")
  (#eq? @_function "new"))
`,
  },
  java: {
    // Text blocks ("""...""") strip indentation, which the decoder does not model.
    grammar: "java",
    escapes: { s: " " },
    query: `
(method_invocation
  object: (identifier) @_class
  name: (identifier) @_method
  arguments: (argument_list . (string_literal) @pattern.string)
  (#eq? @_class "Pattern")
  (#eq? @_method "compile")
  (#not-match? @pattern.string "^\\"\\"\\""))
(method_invocation
  name: (identifier) @_method
  arguments: (argument_list . (string_literal) @pattern.string)
  (#any-of? @_method "matches" "split")
  (#not-match? @pattern.string "^\\"\\"\\""))
(method_invocation
  name: (identifier) @_method
  arguments: (argument_list . (string_literal) @pattern.string . (_))
  (#any-of? @_method "replaceAll" "replaceFirst")
  (#not-match? @pattern.string "^\\"\\"\\""))
`,
  },
  csharp: {
    // Multi-line raw strings strip indentation, which the decoder does not model.
    grammar: "c-sharp",
    query: `
(object_creation_expression
  type: (_) @_type
  arguments: (argument_list . (argument ${CS_STRING} @pattern.string))
  (#match? @_type "(^|\\\\.)Regex$")
  (#not-match? @pattern.string "^\\"\\"\\"+\\\\s*\\n"))
(invocation_expression
  function: (member_access_expression expression: (_) @_type name: (identifier) @_method)
  arguments: (argument_list . (argument) . (argument ${CS_STRING} @pattern.string))
  (#match? @_type "(^|\\\\.)Regex$")
  (#any-of? @_method "Count" "EnumerateMatches" "IsMatch" "Match" "Matches" "Replace" "Split")
  (#not-match? @pattern.string "^\\"\\"\\"+\\\\s*\\n"))
(attribute
  name: (identifier) @_attribute
  (attribute_argument_list . (attribute_argument ${CS_STRING} @pattern.string))
  (#eq? @_attribute "GeneratedRegex")
  (#not-match? @pattern.string "^\\"\\"\\"+\\\\s*\\n"))
`,
  },
  ruby: {
    grammar: "ruby",
    flags: RUBY_FLAGS,
    escapes: { s: " " },
    singleQuoted: /^(?:'|%q)/,
    query: `
(regex) @literal
(call
  receiver: (constant) @_class
  method: (identifier) @_method
  arguments: (argument_list . (string) @pattern.string)
  (#eq? @_class "Regexp")
  (#any-of? @_method "new" "compile"))
`,
  },
  php: {
    grammar: "php",
    flags: PHP_FLAGS,
    query: `
(function_call_expression
  function: (name) @_function
  arguments: (arguments . (argument [(string) (encapsed_string)] @pattern.delimited))
  (#match? @_function "^preg_(filter|grep|match|match_all|replace|replace_callback|split)$"))
`,
  },
};

/** VS Code language IDs that have a `LanguageSpec`, in table order. */
export const SUPPORTED_LANGUAGE_IDS: readonly string[] = Object.keys(LANGUAGES);

/** The grammar that parses regex patterns themselves, for `RegexFinder.syntaxTree`. */
export const REGEX_GRAMMAR = "regex";

/** Grammar names used by `LANGUAGES` and `REGEX_GRAMMAR`, each once. */
export const GRAMMARS: readonly string[] = [
  ...new Set([...Object.values(LANGUAGES).map((spec) => spec.grammar), REGEX_GRAMMAR]),
];

/** The tree-sitter module's exports. */
type TreeSitter = typeof import("@vscode/tree-sitter-wasm");

/**
 * Loads and initializes the tree-sitter runtime once per process, from the directory of the first
 * loader to load it successfully.
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
 * URLs, so that grammars load under bundlers without Node's `path` module.
 *
 * @param dir The directory or URL.
 * @param file The file name.
 *
 * @returns The joined path.
 */
function joinPath(dir: string, file: string): string {
  return `${dir.replace(/[\\/]+$/, "")}/${file}`;
}

/** Loads the tree-sitter runtime and grammars from a WASM directory, each once. */
export class GrammarLoader {
  private readonly wasmDir: string;
  private readonly grammars = new Map<string, Promise<Language>>();

  /**
   * Constructs a new GrammarLoader.
   *
   * @param wasmDir Directory or URL holding `tree-sitter.wasm` and the `tree-sitter-<grammar>.wasm`
   *   files, such as the `wasm` directory of `@vscode/tree-sitter-wasm`.
   */
  constructor(wasmDir: string) {
    this.wasmDir = wasmDir;
  }

  /**
   * Loads a grammar from the WASM directory, once per grammar.
   *
   * @param grammar The grammar name.
   *
   * @returns The grammar.
   */
  grammar(grammar: string): Promise<Language> {
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
   * possibly from a loader with a different directory, tries again.
   *
   * @returns The runtime's exports.
   */
  runtime(): Promise<TreeSitter> {
    runtime ??= loadRuntime(this.wasmDir).catch((error: unknown) => {
      runtime = undefined;
      throw error;
    });
    return runtime;
  }
}

/** One node of a pattern's tree-sitter syntax tree. */
export interface SyntaxTreeNode {
  /** The grammar's node type, such as `term` or `one_or_more`. */
  readonly type: string;
  /** The pattern source the node covers; empty for a missing node. */
  readonly text: string;
  /** Offset of `text` in the pattern, inclusive. */
  readonly start: number;
  /** Offset of `text` in the pattern, exclusive. */
  readonly end: number;
  /** Whether tree-sitter could not parse this part, or inserted it because it was missing. */
  readonly error: boolean;
  /** The named child nodes, and any missing ones, in source order. */
  readonly children: readonly SyntaxTreeNode[];
}

/** Parses patterns into syntax trees with tree-sitter's `REGEX_GRAMMAR`. */
export class RegexParser {
  private readonly grammars: GrammarLoader;
  private regexParser: Promise<Parser> | undefined;

  /**
   * Constructs a new RegexParser.
   *
   * @param wasmDir Directory or URL holding `tree-sitter.wasm` and `tree-sitter-regex.wasm`, such
   *   as the `wasm` directory of `@vscode/tree-sitter-wasm`.
   */
  constructor(wasmDir: string) {
    this.grammars = new GrammarLoader(wasmDir);
  }

  /**
   * Parses a pattern with tree-sitter's `regex` grammar. The grammar recovers from syntax errors,
   * so an invalid pattern still gives a tree, with the unparsed parts marked as errors.
   *
   * @param pattern The pattern, without slashes.
   *
   * @returns The root `pattern` node.
   */
  async syntaxTree(pattern: string): Promise<SyntaxTreeNode> {
    const parser = await this.parser();
    const tree = parser.parse(pattern);
    if (!tree) {
      throw new Error("tree-sitter did not return a syntax tree.");
    }
    try {
      return syntaxNode(tree.rootNode);
    } finally {
      tree.delete();
    }
  }

  /**
   * Creates the parser for patterns, once.
   *
   * @returns A parser using the `REGEX_GRAMMAR`.
   */
  private parser(): Promise<Parser> {
    // A cache: the parser is built once and shared by later calls.
    // eslint-disable-next-line functional/immutable-data
    this.regexParser ??= Promise.all([
      this.grammars.runtime(),
      this.grammars.grammar(REGEX_GRAMMAR),
    ]).then(([treeSitter, language]) => {
      const parser = new treeSitter.Parser();
      parser.setLanguage(language);
      return parser;
    });
    return this.regexParser;
  }
}

/**
 * Copies a tree-sitter node and its descendants into plain data, which outlives the tree.
 *
 * @param node The node.
 *
 * @returns The node, with its named and missing children.
 */
function syntaxNode(node: Node): SyntaxTreeNode {
  return {
    type: node.type,
    text: node.text,
    start: node.startIndex,
    end: node.endIndex,
    error: node.isError || node.isMissing,
    children: node.children
      .filter((child): child is Node => !!child && (child.isNamed || child.isMissing))
      .map(syntaxNode),
  };
}
