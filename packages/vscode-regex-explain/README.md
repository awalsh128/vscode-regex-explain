<p align="center">
  <img src="images/logo.png" alt="Regex Explain logo" width="128" height="128">
</p>

<h1 align="center">Regex Explain</h1>

<p align="center">
  Explain regular expressions in plain English, step by step, and catch patterns that can
  backtrack catastrophically (ReDoS).
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.regex-explain"><img src="https://vsmarketplacebadges.dev/version/awalsh128.regex-explain.svg?label=Version&color=%2314b8a6" alt="Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.regex-explain"><img src="https://vsmarketplacebadges.dev/downloads/awalsh128.regex-explain.svg?label=Marketplace%20downloads&color=blueviolet" alt="Marketplace downloads"></a>
  <a href="https://open-vsx.org/extension/awalsh128/regex-explain"><img src="https://img.shields.io/open-vsx/dt/awalsh128/regex-explain?label=Open%20VSX%20downloads&color=blueviolet" alt="Open VSX downloads"></a>
  <a href="https://github.com/awalsh128/vscode-regex-explain/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/vscode-regex-explain/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/awalsh128/vscode-regex-explain/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

<!-- prettier-ignore -->
> [!TIP]
> If you find this project useful, please consider supporting it
> [as a sponsor and show some ❤️ for open source maintainers](https://github.com/sponsors/awalsh128).

Regexes are found in code in nine languages, and any selected text can be explained.

- :mag: Explanations on hover for regex literals and patterns passed to regex APIs.
- :scissors: Explanations for any pattern you select, in any file.
- :warning: Warnings for patterns that backtrack catastrophically, with an equivalent safe pattern
  when one exists.
- :test_tube: A panel beside the editor that explains the regex and tests it against your input.

---

## Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
  - [Explanation Panel](#explanation-panel)
  - [Following the Cursor](#following-the-cursor)
  - [Backtracking Warnings](#backtracking-warnings)
  - [Supported Languages](#supported-languages)
- [Settings](#settings)
- [Limitations](#limitations)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Installation

Install Regex Explain from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=awalsh128.regex-explain)
or [Open VSX Registry](https://open-vsx.org/extension/awalsh128/regex-explain). Requires VS Code
1.100.0 or newer.

## Basic Usage

Hover a regex in code: a regex literal, or a string literal passed to a regex API (see
[Supported Languages](#supported-languages)). To explain any other pattern, select it in any file,
then hover the selection. Hovering `/^(?<user>[\w.+-]+)@([a-z\d-]+\.)+[a-z]{2,}$/i` shows:

> - `^` Assert position is at the start of the input
> - `(?<user>[\w.+-]+)` Capture group #1 named `user`:
>   - `[\w.+-]+` Match one of, one or more times (as many as possible):
>     - `\w` a word character (letter, digit, or underscore)
>     - `.` the character `.`
>     - `+` the character `+`
>     - `-` the character `-`
> - `@` Match the character `@`
> - `([a-z\d-]+\.)+` Capture group #2, one or more times (as many as possible):
>   - `[a-z\d-]+` Match one of (case-insensitive), one or more times (as many as possible): …
>   - `\.` Match the character `.`
> - `[a-z]{2,}` Match one of (case-insensitive), 2 or more times (as many as possible): …
> - `$` Assert position is at the end of the input
>
> _Matches 6 or more characters._
>
> **Flags**
>
> - `i` _ignoreCase_: Ignore case: letters match both upper and lower case.

Open the explanation panel beside the editor using any of:

- **Hover**: Click **Open explanation** at the end of a hover.
- **Command Palette**: Run **Regex Explain: Explain Regex** (`regexExplain.explain`).
- **Context Menu**: Right-click in the editor and choose **Regex Explain: Explain Regex**.

The command explains the selection, else the regex at the cursor, else a pattern you type.

## Advanced Usage

### Explanation Panel

The panel shows the explanation as a Code Point and Explanation table, with the regex syntax
highlighted in Light+ or Dark+ colors to match a light or dark theme, then an **Input** pane and a
**Match results** table that lists each match with its lines (such as `L3` or `L3–5`) and capture
groups. Click a match to select it.

**Open in regex101**, next to the regex, opens it on [regex101.com](https://regex101.com) in the
JavaScript flavor, with the input text as the test string.

Check **Match each line as a separate entry** to test several inputs at once: each line is matched
on its own, and the table shows every line with its matches or "No match". When the regex uses
multiline mode (the `m` flag or `(?m:...)`) and entries are off, a note says that `^` and `$` match
at the start and end of every line. The input keeps its text and the checkbox its state when you
explain another regex.

### Following the Cursor

While the panel is open, it follows the regex you are working with: moving the cursor into another
regex (in the languages in `regexExplain.hover.languages`), changing the selection in any file,
hovering a regex, or editing the regex shows it in the panel. Hovering follows only while
`regexExplain.hover.enabled` is on; the cursor and selection are followed either way.

Turn off `regexExplain.panel.follow` to keep the panel on its regex until you explain another.
Moving the cursor outside any regex leaves the panel as it is, and closing the panel stops it from
following.

### Backtracking Warnings

For `/^(?:a+)+$/` the hover starts with a warning and, when one exists, an equivalent pattern that
does not backtrack:

> **Warning:** `a+` is repeated by `(?:a+)+` and can match the same text in many ways, so a failed
> match can take exponential time. Equivalent safe pattern: `/^a+$/`

Turn off `regexExplain.checkBacktracking` to hide these warnings.

### Supported Languages

Regexes are found by parsing the file with [tree-sitter](https://tree-sitter.github.io/), so
regex-like text in comments, other strings, and division is ignored. String escapes are decoded:
`"\\d+"` is explained as `\d+`.

| Language                         | Regexes found                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript, TypeScript, JSX, TSX | `/.../flags` literals; `RegExp("...", "flags")` and `new RegExp(...)`                                                                             |
| Vue, Svelte                      | The same, inside `<script>` blocks                                                                                                                |
| Python                           | First argument of `re.` or `regex.` `compile`, `search`, `match`, `fullmatch`, `split`, `findall`, `finditer`, `sub`, `subn`                      |
| Go                               | First argument of `regexp.Compile`, `MustCompile`, their `POSIX` forms, `Match`, `MatchReader`, `MatchString`                                     |
| Rust                             | First argument of `Regex::new` and `RegexBuilder::new`, with any path prefix                                                                      |
| Java                             | First argument of `Pattern.compile`, `matches`, `split`, and two-argument `replaceAll` and `replaceFirst`                                         |
| C#                               | `new Regex(...)`; the pattern argument of static `Regex` methods; `[GeneratedRegex(...)]`                                                         |
| Ruby                             | `/.../flags` and `%r{...}flags` literals; `Regexp.new` and `Regexp.compile`                                                                       |
| PHP                              | The delimited pattern passed to `preg_match`, `preg_match_all`, `preg_replace`, `preg_replace_callback`, `preg_split`, `preg_grep`, `preg_filter` |

## Settings

| Setting                          | Default                                                                                                                                                            | Description                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `regexExplain.hover.enabled`     | `true`                                                                                                                                                             | Show explanations on hover, for regexes in code and selections in any file.                           |
| `regexExplain.hover.languages`   | `javascript`<br>`javascriptreact`<br>`typescript`<br>`typescriptreact`<br>`vue`<br>`svelte`<br>`python`<br>`go`<br>`rust`<br>`java`<br>`csharp`<br>`ruby`<br>`php` | Languages in which regexes in code are found automatically. Only the languages here are supported.    |
| `regexExplain.checkBacktracking` | `true`                                                                                                                                                             | Warn about patterns that take exponential or polynomial time on some input.                           |
| `regexExplain.panel.follow`      | `true`                                                                                                                                                             | While the explanation panel is open, show the regex you move the cursor into, select, hover, or edit. |

Selected text is explained in every language, whatever `regexExplain.hover.languages` contains.
Every setting can also be set for one language:

```json
{
  "[markdown]": {
    "regexExplain.hover.enabled": false
  }
}
```

## Limitations

- Patterns are explained with **JavaScript** regex syntax and meaning, whatever the file's language.
  Most syntax is shared, but constructs specific to other engines, such as Python's `(?P<name>...)`,
  inline flags such as `(?i)`, or possessive quantifiers, are reported as syntax errors. Meaning can
  differ too: Ruby's `^` and `$` also match at line breaks, but are explained as the start and end
  of the input.
- Flags are translated to JavaScript, such as Ruby's `m` to `s`. Flags that do not change what
  matches, such as Ruby's `o` or PHP's `u`, are ignored; others, such as `x`, are reported.
- Only the calls in the [Supported Languages](#supported-languages) table are recognized, by name:
  aliased imports such as `from re import compile` are not. Flags passed as separate arguments, such
  as `re.IGNORECASE`, are not read. Strings built at run time, such as f-strings, interpolations, or
  concatenations, are skipped, as are strings with escapes such as `\N{name}`, `\a`, or `\e`. For
  anything else, select the pattern text (without quotes) and hover it.
- Java text blocks and multi-line C# raw strings are skipped, because their indentation is removed.
- Files over 1,000,000 characters are not scanned; selections still work.
- The panel matches with JavaScript's `RegExp`, whatever the file's language, and always finds every
  match (as if with the `g` flag). It lists the first 1,000 matches (with separate entries, later
  lines are not shown), and stops matching after one second, which happens with patterns that
  backtrack catastrophically on the input.
- The backtracking check reports quantifiers that can trade characters with each other or with
  themselves. It does not report patterns that are slow only because the engine retries them at
  every input position, such as `/a+b/`.

## Troubleshooting

- **No hover on a regex:** Check that the file's language ID is in `regexExplain.hover.languages`,
  that `regexExplain.hover.enabled` is `true`, and that the regex is written as the
  [Supported Languages](#supported-languages) table describes. In `.vue` and `.svelte` files, the
  language ID comes from the Vue or Svelte extension; without one, the file is plain text and only
  selections are explained.
- **A hover from another extension appears instead:** VS Code shows every provider's hover together;
  scroll the hover to find the explanation.

The explanations, regex detection, and matching come from the
[`regex-explain`](https://github.com/awalsh128/vscode-regex-explain/tree/main/packages/regex-explain)
library, which you can use in your own tools. Report bugs or request features through
[GitHub Issues](https://github.com/awalsh128/vscode-regex-explain/issues). For development and
publishing, see
[CONTRIBUTING.md](https://github.com/awalsh128/vscode-regex-explain/blob/main/CONTRIBUTING.md).

## License

[Apache 2.0](LICENSE).
