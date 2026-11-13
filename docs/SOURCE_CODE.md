# Source Code Documentation

## Architecture

```
┌──────────────────────────── VS Code extension (packages/vscode-regex-explain) ──┐
│  extension.ts ── registers ──┬─> hover.ts    RegexHoverProvider                 │
│                              ├─> explain.ts  ExplainCommandHandler              │
│                              └─> follow.ts   PanelFollower: regex at the cursor │
│  targets.ts      RegexLocator: selection or regex at a position (cached)        │
│  webview/host.ts  ExplanationPanel: opens the panel, answers match requests     │
│  webview/panel.ts PanelTemplate: ExplanationModel ─> panel.html (Mustache)      │
│  webview/highlight.ts  highlight(): Shiki regexp tokens in Light+ and Dark+     │
│  webview/diagram.ts  layoutMachine(): state machine ─> SVG coordinates          │
│  webview/main.ts  panel script (browser): wires the page, saves its state       │
│  webview/results.ts  results table, gutter numbers, match requests (browser)    │
│  webview/protocol.ts  messages between the webview and the extension            │
│  matcher.ts      RegexMatcher: findMatches() in a worker thread, timed          │
│  configuration.ts  getConfig(): the only settings reader                        │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ explainRegex(), ExplanationRenderer, stateMachine(), RegexFinder, findMatches
┌──────────────────────────── Library (packages/regex-explain) ───────────────────┐
│  index.ts        public API                                                     │
│  explainer.ts    regexpp AST ─> ExplanationNode tree, length, warnings          │
│  render.ts       ExplanationRenderer: Markdown, plain text, or model            │
│  machine.ts      stateMachine(): regexpp AST ─> transitions, choices, repeats   │
│  text.ts         wording helpers, code span splitting                           │
│  locator.ts      RegexFinder: tree-sitter parse + query ─> LocatedRegex[]       │
│  compiler.ts     LANGUAGES: grammar and query per language ID                   │
│  strings.ts      string escapes, PCRE delimiters, flag translation              │
│  matches.ts      findMatches(): RegExp over text ─> matches with lines          │
│  extlinks.ts     regex101Url(): links that open a regex in external tools       │
│                                                                                 │
│  @eslint-community/regexpp   regexp-ast-analysis   scslre (ReDoS)               │
│  @vscode/tree-sitter-wasm (optional peer, loaded on first find)                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

A hover runs: `RegexHoverProvider.provideHover` → `RegexLocator` finds the selection containing the
position, else the regex under it → `explainRegex` → `ExplanationRenderer.markdownList` →
`vscode.Hover`, starting with an **Open explanation** command link.

The command, or that link, calls `ExplanationPanel.show`, which sets the webview's HTML from
`PanelTemplate.render`. As the user types or toggles separate entries, the webview script posts
`{ type: "match", id, text, entries }`; `ExplanationPanel.respond` runs the shown regex through
`RegexMatcher`, which starts a worker thread for `findMatches` and terminates it after
`MATCH_TIMEOUT_MS` or when a newer request, or closing the panel, cancels it, and posts back
`{ type: "matches", id, model, regex101Url }`, where `regex101Url` opens the regex and the text on
regex101.com and `model` is the library's `describeMatches` of the response and holds the worded
summary and matches. The script ignores replies to superseded ids.

## Repository Layout

```
.claude/agents/        Claude Code documentation reviewer
.husky/                Git hooks, enabled by npm install through husky: pre-commit runs
                       npm run check, commit-msg runs commitlint
.github/               Workflows and their composite actions, Octo STS trust policies
                       (chainguard/), issue forms, labels, Copilot instructions and reviewer
docs/                  This file, the development guidelines, and agent skill notes (agents/)
packages/regex-explain/          The npm library (each package keeps a LICENSE copy for its registry
                                 and a release.config.cjs for semantic-release)
packages/vscode-regex-explain/   The VS Code extension, its test workspace, and its icon
                                 (images/logo.png, rendered from images/logo.svg)
scripts/               Consistency checks, setup, release versioning, registry publishing, label
                       sync (own tsconfig)
tsconfig.base.json     Compiler options shared by every project
tsconfig.json          Build entry point referencing the packages and scripts
```

## Build

| Output                                                     | Produced by                                                 | Used for                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- |
| `packages/regex-explain/dist/cjs/`                         | `tsc -p tsconfig.build.json` (with `.d.ts`)                 | npm `require` and types                     |
| `packages/regex-explain/dist/esm/index.mjs`                | esbuild, dependencies external                              | npm `import`                                |
| `packages/*/out/`                                          | `tsc -b` (sources and tests)                                | Tests                                       |
| `packages/vscode-regex-explain/dist/extension.js`          | `bundle.mjs`: esbuild, all but `vscode`                     | The extension (`main`)                      |
| `packages/vscode-regex-explain/dist/matchWorker.js`        | `bundle.mjs`: esbuild from `matcher.ts`, with `findMatches` | `RegexMatcher`'s worker                     |
| `packages/vscode-regex-explain/dist/webview.js`            | `bundle.mjs`: esbuild for the browser, with vscode-elements | The panel script                            |
| `packages/vscode-regex-explain/dist/panel.*`, `parts.html` | `bundle.mjs`: copies from `src/webview/`                    | `PanelTemplate`, the page                   |
| `packages/vscode-regex-explain/dist/*.wasm`                | `bundle.mjs`: copies the runtime and `GRAMMARS`             | Loaded by `RegexFinder`                     |
| `out/scripts/`                                             | `tsc -b`                                                    | The extension's `release.config.cjs` plugin |

For type checking and bundling, the extension's two `tsconfig.json` files map `regex-explain` to the
library's `src/index.ts` with `paths` and reference the library's project. Editors therefore see the
library's types without a build, `tsc -b` builds the library first and checks against its
declarations, and esbuild bundles the library's source, where the library's `"sideEffects": false`
keeps the match worker to `findMatches` alone. At run time, tests and `bundle.mjs` load the library
through its workspace link, `node_modules/regex-explain` at the root, to its `exports`, so
`npm run compile` still builds the library's `dist/` first.

The extension is not a workspace member, because npm requires unique names across a workspace and
both packages are named `regex-explain`. Its build dependencies are in the root `package.json`, and
root scripts reach it with `--prefix packages/vscode-regex-explain`. The extension manifest sets
`"vsce": { "dependencies": false }` so that vsce, including semantic-release-vsce, packages only the
bundle.

## Library Modules

### `explainer.ts`

`explainRegex(pattern, flags, options)` parses with `RegExpParser` (ECMAScript 2025) and returns a
`RegexExplanationError` for syntax errors. Otherwise it walks the AST:

- `explainAlternatives` lists alternatives as numbered options, or inlines a single alternative.
- `explainSequence` merges consecutive `Character` nodes into one "Match the text" step.
- `explainQuantifier` appends the repetition to its element's description and keeps its children.
- `explainClass` and `explainClassElement` describe classes, ranges, `v`-flag set operations, and
  `\q{}` strings as noun phrases.
- A `Context` carries the flags in effect. Inline modifier groups such as `(?i:...)` replace it for
  their contents.
- `caseNote` compares `toUnicodeSet()` with and without `ignoreCase`, so "(case-insensitive)" is
  added only where ignoring case changes what matches.
- Group numbers come from `getCapturingGroupNumber`, and the match length from `getLengthRange`.
- `findBacktracking` runs `scslre.analyse` on the same AST with `Move` reports disabled, and keeps a
  report's `fix()` when one exists.

`parseRegexInput` splits `/pattern/flags` text without validating it, or takes bare text as a
pattern, and `isRegexSource` is the type guard for untyped `RegexSource` values.

### `render.ts`

`ExplanationRenderer` wraps an `ExplainResult`. `model()` is the only place that reads the result:
it flattens the node tree with depths and pairs each description with its `splitCodeSpans` parts.
`markdownList`, `markdownTable`, and `text` render from the model in one layout: warnings, then the
steps, the length sentence, and the flags. A syntax error's model carries only the parser's reason,
since all three formats and the panel add their own label, and the pattern's `line` that holds the
error with the `caret` under it, which they print, so a long multi-line selection is not repeated
whole. Markdown uses the descriptions as they are, `text` joins the parts with code in double
quotes, and table cells escape `|`.

### `machine.ts`

`stateMachine()` parses the pattern again with `parseRegex()`, the parser setup it shares with
`explainRegex`, and builds a tree of transitions, sequences, choices, repeats, and groups. It merges
literal runs as `explainSequence` does, so each transition takes its description from the
explanation node with the same source span; an element without one, such as the `\d` in `\d+`, takes
its quantifier's.

### `text.ts`

`code()` builds code spans that survive backticks, `describeCodePoint()` names characters (named
controls, `U+XXXX` for invisible ones), and `lowerFirst()` and `withArticle()` adjust phrases.
`splitCodeSpans()` reverses `code()` for the renderer's model; it is internal.

### `locator.ts`

`RegexFinder` imports `@vscode/tree-sitter-wasm` on first use, so the rest of the library works
without that optional peer dependency, skips sources over `MAX_SCAN_LENGTH` characters, and loads
each grammar once from a WASM directory or URL (`dist/` in the extension, the installed package in
tests). The runtime is shared by every finder in the process; a failed load is not cached, so the
next `find` tries again. Paths are joined with `/` rather than Node's `path`, so the module also
works in bundlers. `find` parses the text, runs the language's query, and reads each match by its
capture names: regex literals keep their source text, string literals are decoded, and strings with
interpolations are skipped. For `scriptBlocks` languages (Vue, Svelte) only `<script>` blocks are
parsed, through `includedRanges`. Offsets are UTF-16 code units, as VS Code expects.

### `compiler.ts`

`LANGUAGES` maps a VS Code language ID to a grammar, a tree-sitter query, flag translations, and
string escapes that differ from JavaScript's, such as Java's and Ruby's `\s` for a space. The module
comment defines the capture names. To add a language, add an entry and a case to `compiler.test.ts`.
The extension's `bundle.mjs` copies the grammar, and `SUPPORTED_LANGUAGE_IDS` sets the
`hover.languages` default, which must also be added to the manifest's default and `enum`, and to the
extension README's language table and settings default.

### `strings.ts`

`decodeEscape` decodes one escape the grammar marked, preferring the language's own `escapes`;
`singleQuotedValue` reads strings whose grammar marks no escapes, such as Ruby's `'...'`, where only
`\\` and an escaped delimiter lose their backslash; `splitDelimitedPattern` reads PHP's
`/pattern/flags`; `translateFlags` maps flags to JavaScript's. These are internal.

### `matches.ts`

`findMatches` adds `g`, relies on `matchAll` to step past empty matches, stops at the limit, and
maps offsets to 1-based lines. It has no time limit; callers that run untrusted patterns stop it
from outside, as the extension's `RegexMatcher` does. `describeMatches` words the outcome for
display: the summary sentence, `L1–2` line labels, and `$1` or named group labels.

## Extension Modules

- `extension.ts`: `activate` creates one `RegexLocator`, one `RegexMatcher` (for
  `dist/matchWorker.js`), and one `ExplanationPanel`, then registers a hover provider for every
  scheme, `regexExplain.explain`, and a `PanelFollower`.
- `hover.ts`: `RegexHoverProvider` checks `hoverEnabled`, explains the target, and puts a trusted
  `$(open-preview)` command link that opens the panel with the same pattern above the explanation.
  When `panelFollow` is on, it also passes the target to `ExplanationPanel.follow`, so an open panel
  shows the hovered regex.
- `follow.ts`: `PanelFollower` listens for selection changes and edits in the active editor, waits
  `FOLLOW_DELAY_MS` for them to settle, and, when `panelFollow` is on, passes the regex at the
  cursor to `ExplanationPanel.follow`. That shows it only when the panel is open and the regex
  differs, and, unlike `show`, does not reveal the panel, so the panel stays where the user put it.
  A cursor outside any regex leaves the panel as it is.
- `explain.ts`: `ExplainCommandHandler` picks the hover link argument, the editor target, or an
  input box, and shows it in the panel. Menus pass a `Uri`, which the library's `isRegexSource`
  rejects.

`src/webview/` holds the explanation panel. `host.ts` and `panel.ts` run in the extension host and
belong to the extension's TypeScript project; `main.ts` and `results.ts` run in the webview and have
their own `tsconfig.json` with DOM types, which compiles only them and `protocol.ts`, the messages
the two sides share. `webview/test/` holds the tests of `results.ts`, with a `tsconfig.json` that
adds Node types; `npm run test:unit` runs them with `tsx` in a happy-dom window over `panel.html`.

- `webview/host.ts`: `ExplanationPanel` keeps one webview panel beside the editor, reused for each
  regex, and answers the page's match requests with `RegexMatcher`, up to `MATCH_LIMIT` matches. A
  new request aborts the one in progress, whose reply the page would ignore, so typing against a
  slow pattern runs one worker at a time. Its page allows only its own nonce-tagged script and files
  from `dist/`.
- `webview/panel.ts`: `PanelTemplate` reads `panel.html` and the `parts.html` partial once, then
  renders `ExplanationRenderer.model()` with Mustache, adding each row's indent, the error's caret
  line, highlighted HTML for the literal, each row's `raw`, and a warning's fix, and the laid-out
  state machine. Every other value is escaped with `escape-html`; the template inserts the
  highlighted HTML unescaped, because Shiki has already escaped its text. The page also holds the
  `match-item` and `match-group` `<template>` elements that the panel script clones. It does not
  import `vscode`, so it is tested in Node, reading the templates from `src/webview/`; the extension
  reads the copies in `dist/`. Markup belongs in the templates, not in TypeScript strings; Prettier
  skips the templates because its HTML formatter would rewrap Mustache tags.
- `webview/highlight.ts`: `highlight()` tokenizes a pattern with Shiki's TextMate `regexp` grammar,
  through the synchronous core and its JavaScript regex engine, so rendering needs neither `await`
  nor WebAssembly. It runs in the extension host and cannot see the webview's theme, so each token
  carries both Light+ and Dark+ colors as `--shiki-light` and `--shiki-dark` variables, and
  `panel.css` uses the Light+ colors unless the body has the `vscode-dark` class or a dark
  `vscode-high-contrast` class. Rows are highlighted without their surrounding pattern, so a class
  member such as `+` in `[+-]` is colored as a quantifier.
- `webview/diagram.ts`: `layoutMachine()` lays out `stateMachine()` left to right in two passes:
  `measure` sizes each part from its children (label widths are estimated from character counts),
  then `place` assigns coordinates and SVG path data. It returns plain lists of states, lines,
  transitions, loops, boxes, and tooltips that `panel.html` draws, so no markup is built in
  TypeScript; colors come from `--vscode-charts-*` theme variables in `panel.css`.
- `webview/panel.html`, `webview/parts.html`, `webview/panel.css`: the page's templates and its
  stylesheet, which uses `--vscode-*` theme variables. They sit beside `webview/main.ts` because the
  script and styles depend on the page's IDs and classes.
- `webview/main.ts`: runs in the webview and connects the page's elements. It follows the inner
  textarea's scrolling in the gutter (through `wrappedElement`, with wrapping off and a fixed line
  height), keeps the input and the entries checkbox in `setState`, and stacks the panes below 600
  px. It shows a state machine step's tooltip (the element its `aria-describedby` names) on hover or
  focus. It has no automated tests; the logic it calls is in `results.ts`, and the diagram's layout
  in `diagram.ts`.
- `webview/results.ts`: `lineNumbers()` numbers the gutter, `MatchRequests` sends a match request
  once the input stops changing and tells the reply to the last request from stale ones,
  `showResults()` lists matches or entries by cloning the page's `<template>` elements, and
  `selectMatch()` selects a clicked match in the input. It works on the elements it is given, so it
  is tested without VS Code.
- `webview/protocol.ts`: the webview message types and `isMatchMessage`. It imports only types, so
  both builds include it.
- `matcher.ts`: `RegexMatcher` runs each request through the library's `findMatches` in a new
  `worker_threads` worker, so that catastrophic backtracking can be stopped, at the time limit or
  when the request's `AbortSignal` fires. The module is also the worker's entry point
  (`dist/matchWorker.js`); it answers requests only in threads that `RegexMatcher` started, which it
  marks through `workerData`.
- `targets.ts`: `RegexLocator` returns the selection containing a position (any language) or the
  regex at it (configured languages). For the cursor (`targetAt`), a regex that ends at the position
  also counts, so typing a literal's flags keeps it in the panel; hovers (`regexAt`) use the hovered
  character only. Regexes are cached per document version as a promise.
- `configuration.ts`: `getConfig()` and `DEFAULT_CONFIGURATION`. An integration test checks the
  defaults against the manifest.

## Dependencies

| Package                     | Used by                            | Why                                                                                                                                                                                                       |
| --------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eslint-community/regexpp` | Library                            | Maintained ECMAScript regex parser with exact offsets; ESLint's own                                                                                                                                       |
| `regexp-ast-analysis`       | Library                            | Character sets with case folding, group numbers, length ranges on the regexpp AST                                                                                                                         |
| `scslre`                    | Library                            | Detects polynomial and exponential backtracking on the regexpp AST and derives safe rewrites                                                                                                              |
| `shiki`                     | Extension                          | TextMate-grammar syntax highlighting with VS Code's own themes; the panel loads only the `regexp` grammar (9 KB) and the Light+ and Dark+ themes, adding about 170 KB to the bundle                       |
| `mustache`                  | Extension                          | Small, logic-less templates with HTML escaping, loops, conditions, and partials, so the panel markup lives in template files rather than TypeScript strings                                               |
| `escape-html`               | Extension                          | Escapes Mustache values for HTML content and quoted attributes; the package Express uses, and it leaves `/` and `=` alone, unlike Mustache's built-in escaper                                             |
| `@vscode-elements/elements` | Extension                          | Lit web components styled with VS Code's theme variables; the maintained successor to the deprecated `@vscode/webview-ui-toolkit`. The panel imports only the table, checkbox, textarea, and split layout |
| `@vscode/tree-sitter-wasm`  | Library (optional peer), extension | Typed tree-sitter runtime and prebuilt grammars from the VS Code team, ABI-matched; WASM, so one VSIX works on every platform                                                                             |

`regexp-ast-analysis` and `scslre` depend on `refa`, which is about 1 MB of the 1.5 MB extension
bundle (mostly Unicode case-folding data) and loads in roughly 25 ms. They are maintained alongside
`eslint-plugin-regexp`, which uses the same stack.

The grammars ship as `.wasm` files next to the bundle (about 14 MB, 1.3 MB compressed in the VSIX)
and load on first use of each language. tree-sitter recovers from syntax errors, so a file being
edited still yields its other regexes.

Considered and not used: `regexp-tree` and `regjsparser` (a second AST to keep in sync), `randexp`
(its own parser, which differs from JavaScript in edge cases), `unicode-property-value-aliases` (no
types), `js-tokens` (JavaScript only), `@ast-grep/napi` (native binaries per platform), and
`@ast-grep/wasm` (a pattern layer over the same tree-sitter runtime that imports its `.wasm` as an
ES module, needs manual `free()` calls, and types matchers as `any`; tree-sitter queries express the
same matches).

StrykerJS (`@stryker-mutator/core`, with `@stryker-mutator/typescript-checker` to skip mutants that
do not compile) measures how well the library's unit tests catch changes, which line coverage
cannot. `stryker.config.json` uses Stryker's command runner to run Mocha through `tsx`, because
`@stryker-mutator/mocha-runner` imports `mocha/lib/cli/run-helpers`, which Mocha 12 renamed to
`run-helpers.cjs`.

## Tests

See [AI_GUIDELINES.md](AI_GUIDELINES.md#tests). The integration launcher
(`src/test/integration/runTest.ts`) clears `ELECTRON_RUN_AS_NODE`, which VS Code terminals can set
and which would otherwise start Electron as Node, and uses a fresh temporary profile for each run.
It tests the VS Code version in `VSCODE_TEST_VERSION`, or stable when unset; CI also runs it on
Windows, macOS, and the oldest version `engines.vscode` accepts.
