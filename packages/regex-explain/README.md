# regex-explain

Explains ECMAScript regular expressions in plain English, as a tree of steps that follows the
pattern's structure. It also reports how long a match can be and warns about catastrophic
backtracking (ReDoS), suggesting an equivalent safe pattern when one exists. It can also find the
regexes in source code in several languages, and run a regex over text to list its matches by line.

```sh
npm install regex-explain
```

The package ships CommonJS and ES module builds with TypeScript types, and needs Node.js 18 or
later. Finding regexes in source code also needs the optional peer dependency
[`@vscode/tree-sitter-wasm`](https://www.npmjs.com/package/@vscode/tree-sitter-wasm):

```sh
npm install @vscode/tree-sitter-wasm
```

## Usage

```ts
import { ExplanationRenderer, explainRegex } from "regex-explain";

const result = explainRegex("^\\d{3}-\\d{4}$");
console.log(new ExplanationRenderer(result).text());
```

```text
^      Assert position is at the start of the input
\d{3}  Match a digit (0-9), exactly 3 times
-      Match the character "-"
\d{4}  Match a digit (0-9), exactly 4 times
$      Assert position is at the end of the input

Matches exactly 8 characters.
```

`markdownTable()` renders the same result as Markdown:

<!-- prettier-ignore -->
```md
| Code Point | Explanation |
| ---------- | ----------- |
| `^` | Assert position is at the start of the input |
| `\d{3}` | Match a digit (0-9), exactly 3 times |
| `-` | Match the character `-` |
| `\d{4}` | Match a digit (0-9), exactly 4 times |
| `$` | Assert position is at the end of the input |

*Matches exactly 8 characters.*
```

Use `model()` or walk `result.nodes` to build your own output. Each node carries the source it
explains and its offsets in the pattern, so you can highlight it:

```json
{
  "raw": "\\d{3}",
  "start": 1,
  "end": 6,
  "description": "Match a digit (0-9), exactly 3 times",
  "children": []
}
```

## API

### `explainRegex(pattern, flags?, options?)`

Explains `pattern` (without slashes, as passed to `new RegExp()`) compiled with `flags`. Returns an
`ExplainResult`; it does not throw for invalid patterns.

- `ExplainOptions`: `{ checkBacktracking?: boolean }`. The backtracking check is on by default.
- `ExplainResult`: either a `RegexExplanation` (`ok: true`) or a `RegexExplanationError`
  (`ok: false`, with `message` and, when known, the `index` of the error in the pattern).
- `RegexExplanation` has:
  - `nodes`: the top-level `ExplanationNode` steps. Each node has `raw`, `start`, `end`,
    `description`, and `children`. Descriptions may contain Markdown code spans.
  - `flagExplanations`: one `FlagExplanation` (`flag`, `name`, `description`) per flag.
  - `length`: a `LengthSummary` with the `min` and `max` characters a match consumes. `max` is
    `Infinity` when unbounded.
  - `warnings`: `BacktrackingWarning` entries with the quantifier's `raw`, `start`, and `end`,
    whether the backtracking is `exponential`, an `attackCharacter` that triggers it when repeated,
    a `description`, and a `fix` (`pattern` and `flags`) when an equivalent safe pattern exists.
  - `multiline`: whether `^` and `$` match at line breaks anywhere in the pattern, through the `m`
    flag or a group such as `(?m:...)`. `explainRegex("(?m:^a)").multiline` is `true`.

### `parseRegexInput(text)` and `isRegexSource(value)`

`parseRegexInput` reads text a user typed or selected as a `RegexSource` (`{ pattern, flags }`, as
`new RegExp()` takes them): a literal such as `/ab+c/gi`, optionally surrounded by whitespace, is
split into its pattern and flags, and anything else is a bare pattern with no flags.
`parseRegexInput("/ab+c/gi")` returns `{ pattern: "ab+c", flags: "gi" }` and
`parseRegexInput("ab+c")` returns `{ pattern: "ab+c", flags: "" }`. It does not validate the
pattern. Results, located regexes, and match requests all extend `RegexSource`. `isRegexSource` is a
type guard that tells whether an untyped value, such as a command argument, has string `pattern` and
`flags` properties.

### `ExplanationRenderer`

`new ExplanationRenderer(result)` renders an `ExplainResult` in several formats:

- `markdownList(options?)`: a nested Markdown list, as in hovers.
- `markdownTable(options?)`: a Markdown table with Code Point and Explanation columns. Nested steps
  are indented with `&nbsp;`.
- `text(options?)`: aligned plain text, with code spans shown in double quotes.
- `model()`: everything a view shows, as an `ExplanationModel`, which the other formats render from:
  the regex as a `literal` (`/pattern/flags`), the `error` (`ErrorModel`: `message`, `pattern`,
  `index`, and a `caret` line such as `"   ^"` to print under the pattern) for an invalid pattern,
  `warnings` (`WarningModel`: the `fix` as a literal), the steps as `rows` (`ExplanationRow`: `raw`
  and nesting `depth`), the `length` sentence such as "Matches 2 to 4 characters.", `flags`
  (`FlagModel`: `flag` and `name`), and whether the pattern is `multiline`. Each warning, row, and
  flag has a `description`, which may contain Markdown code spans, and the same text as `parts`:
  `TextPart`s with the `text` and whether it is `code`, so that HTML or other UIs render it without
  a Markdown parser. For an invalid pattern, the model has only the `literal` and `error`; its lists
  are empty.

The Markdown and text formats put warnings first, then the steps, the match length, and the flags.
Invalid patterns render the error with a caret under its position. `RenderOptions`:
`{ title?: boolean }` starts the output with the whole regex (under a heading in Markdown).

### `describeCount(min, max)`

Words a repetition count ("one or more times"), for callers that build their own output.

### `RegexFinder` and `findRegexAt(regexes, offset)`

`new RegexFinder(wasmDir)` finds regexes in source code with tree-sitter: regex literals, and string
literals passed to regex APIs such as `new RegExp()`, Python's `re.compile()`, or Java's
`Pattern.compile()`. `wasmDir` is a directory or URL holding `tree-sitter.wasm` and the grammar
files; in Node, pass the `wasm` directory of `@vscode/tree-sitter-wasm`. Finders share one runtime,
loaded on first use from the first `wasmDir` that loads it without error; each grammar loads on
first use. `find` returns no regexes for a source longer than 1,000,000 characters, since parsing
generated or minified files on every change is slow.

```ts
import { createRequire } from "module";
import * as path from "path";
import { RegexFinder, findRegexAt } from "regex-explain";

const require = createRequire(import.meta.url);
const finder = new RegexFinder(path.dirname(require.resolve("@vscode/tree-sitter-wasm")));
const source = 'import re\nDATE = re.compile(r"(\\d{4})-(\\d{2})")\n';
const regexes = await finder.find(source, "python"); // in an ES module
// [ { pattern: '(\\d{4})-(\\d{2})', flags: '', start: 28, end: 46 } ]
findRegexAt(regexes, 30); // the same regex, which covers offset 30
```

- `find(source, languageId)` resolves to `LocatedRegex`es (`pattern`, `flags`, `start`, and `end`
  offsets in UTF-16 code units), in order. String escapes are decoded, so `"\\d"` in source becomes
  `\d`, and flags are translated to JavaScript, such as Ruby's `m` to `s`. Strings built at run
  time, such as interpolations, are skipped. Unsupported languages give `[]`.
- `supports(languageId)` tells whether a language is supported.
- `SUPPORTED_LANGUAGE_IDS` lists the language IDs, which are VS Code's: `javascript`,
  `javascriptreact`, `typescript`, `typescriptreact`, `vue`, `svelte` (both inside `<script>` blocks
  only), `python`, `go`, `rust`, `java`, `csharp`, `ruby`, and `php`. The
  [extension README](https://github.com/awalsh128/vscode-regex-explain/tree/main/packages/vscode-regex-explain#readme)
  lists the calls recognized in each.
- `GRAMMARS` lists the grammar names, for copying `tree-sitter-<grammar>.wasm` files when bundling.

### `findMatches(request)`

Runs a `MatchRequest` (`pattern`, `flags`, `text`, a match `limit`, and optionally `entries`) with
JavaScript's `RegExp`, adding `g` if missing. It returns a `MatchResponse`: the `matches`, whether
they were `truncated` at the limit, and an `error` if the pattern does not compile. `findMatches`
never sets `timedOut`; it is there for callers that stop matching from outside, such as a worker
with a time limit. Each `FoundMatch` has `start` and `end` offsets, the matched `text`, the 1-based
`startLine` and `endLine`, the numbered `groups`, and the `named` groups.

```ts
findMatches({
  pattern: "(\\d{4})-(\\d{2})",
  flags: "",
  text: "due 2024-05\nor 2025-01",
  limit: 100,
});
// matches[0]: { start: 4, end: 11, text: "2024-05", startLine: 1, endLine: 1,
//               groups: ["2024", "05"], named: {} }
// matches[1]: { start: 15, end: 22, text: "2025-01", startLine: 2, endLine: 2, ... }
```

With `entries: true`, each line is a separate entry, matched on its own: `^` and `$` match at its
ends and no match spans lines. A line break at the end of the text does not start another entry. The
response then also has the `entries` (`MatchEntry`: the 1-based `line`, its `start` and `end`
offsets without the line break, and its `text`). Match offsets and lines are still in the whole
text. When matching stops at the limit, entries after the one holding the last match are left out.

```ts
findMatches({
  pattern: "^\\d{4}-\\d{2}$",
  flags: "",
  text: "2024-05\nsoon\n2025-01",
  limit: 100,
  entries: true,
});
// matches: "2024-05" (start 0, startLine 1) and "2025-01" (start 13, startLine 3)
// entries: [ { line: 1, start: 0, end: 7, text: "2024-05" },
//            { line: 2, start: 8, end: 12, text: "soon" },
//            { line: 3, start: 13, end: 20, text: "2025-01" } ]
```

A pattern that backtracks catastrophically can run for a very long time; run untrusted patterns
where they can be stopped, such as a worker thread.

### `describeMatches(response)`

Words a `MatchResponse` for display, returning a `MatchesModel`: a one-sentence `summary` such as "2
matches.", "More than 2 matches (showing the first 2)." when matching stopped at the limit, or why
the regex could not run, whether it reports a `problem` (an `error` or `timedOut`), and the
`matches` (`MatchModel`). Each has the `start` and `end` offsets, `lines` such as `L1` or `L1–2`,
the `text` ("(empty)" for an empty match), and `groups` (`MatchGroupModel`: the `name`, which is
`$1`, `$2`, and so on or the group's name, the `value` ("(no match)" if the group did not take
part), and whether it `matched`).

For a response with `entries`, the summary counts entries instead, such as "2 of 3 entries match.",
"At least 2 entries match (showing the first 2 matches)." at the limit, or "No entries.", and the
model also has the `entries` (`EntryModel`: the `line` such as `L2`, its `start` and `end`, its
`text` ("(empty)" for an empty line), whether it `matched`, and its `matches`). For the entries
example above, they are `L1` "2024-05" (matched, 1 match), `L2` "soon" (not matched), and `L3`
"2025-01" (matched, 1 match).

```ts
const model = describeMatches(
  findMatches({
    pattern: "(?<year>\\d{4})-(\\d{2})",
    flags: "",
    text: "due 2024-05\nor 2025-01",
    limit: 100,
  })
);
// model.summary: "2 matches."   model.problem: false   model.matches[1].lines: "L2"
// model.matches[0]: { start: 4, end: 11, lines: "L1", text: "2024-05",
//   groups: [ { name: "$1", value: "2024", matched: true },
//             { name: "$2", value: "05", matched: true },
//             { name: "year", value: "2024", matched: true } ] }
```

### `regex101Url(source, testString?)`

Builds a [regex101](https://regex101.com) link that opens a `RegexSource` in the JavaScript flavor,
prefilled through the query string as the
[regex101 FAQ](https://github.com/firasdib/Regex101/wiki/FAQ#how-to-prefill-the-fields-on-the-interface-via-url)
describes. Values are percent-encoded, and the test string is left out when empty.

```ts
regex101Url({ pattern: "a+b", flags: "gi" });
// "https://regex101.com/?regex=a%2Bb&flags=gi&flavor=javascript"
```

### Migrating from `renderMarkdown` and `renderText`

`renderMarkdown(result, options)`, `renderText(result, options)`, and `describeLength(result)` were
replaced by `new ExplanationRenderer(result).markdownList(options)`, `.text(options)`, and
`.model().length`.

## Semantics and limitations

Patterns follow **JavaScript** semantics up to ES2025: named and duplicate named groups, lookbehind,
Unicode property escapes, the `v` flag's set operations and `\q{...}`, and inline modifiers such as
`(?i:...)`. Most constructs specific to other engines are reported as syntax errors, but without the
`u` or `v` flag an escape JavaScript lacks, such as `\A` or `\z`, is explained as the plain letter.

The backtracking check omits patterns that are slow only because the engine retries them at every
input position (for example `/a+b/`); those are too common to be useful as warnings. Fixes are not
offered when a rewrite would change what a capture group holds.

## How it works

Parsing uses [`@eslint-community/regexpp`](https://github.com/eslint-community/regexpp), the parser
behind ESLint's regex rules. Character sets, case folding, and match lengths come from
[`regexp-ast-analysis`](https://github.com/RunDevelopment/regexp-ast-analysis), and backtracking
analysis from [`scslre`](https://github.com/RunDevelopment/scslre), the libraries used by
[`eslint-plugin-regexp`](https://github.com/ota-meshi/eslint-plugin-regexp). This package walks the
parsed tree and words the results. Finding regexes in source code uses tree-sitter grammars from
[`@vscode/tree-sitter-wasm`](https://github.com/microsoft/vscode-tree-sitter-wasm) with one query
per language.

## License

Apache-2.0
