/**
 * Where regexes appear in each supported language, as tree-sitter queries over the grammars in
 * `@vscode/tree-sitter-wasm`. Adding a language means adding an entry here; the locator and the
 * bundle script read this table.
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

/** VS Code language IDs that have a {@link LanguageSpec}, in table order. */
export const SUPPORTED_LANGUAGE_IDS: readonly string[] = Object.keys(LANGUAGES);

/** Grammar names used by {@link LANGUAGES}, each once. */
export const GRAMMARS: readonly string[] = [
  ...new Set(Object.values(LANGUAGES).map((spec) => spec.grammar)),
];
