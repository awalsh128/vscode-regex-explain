# Regex Explain

Explains regular expressions in plain English, finds them in source code, warns about catastrophic
backtracking, and matches them against text. One vocabulary covers the `regex-explain` library and
the VS Code extension.

## Regexes

**Regex**: A pattern and its flags, as JavaScript's `RegExp` takes them. _Avoid_: expression,
regular expression object

**Pattern**: A regex's source without slashes or flags, such as `ab+c`. _Avoid_: source, expression

**Flags**: The letters after a pattern that change how it matches, such as `g` and `i`. _Avoid_:
modifiers (inline modifiers such as `(?i:...)` are part of the pattern)

**Literal**: A regex written as `/pattern/flags`. _Avoid_: regex string

**Regex API call**: A call that compiles its string argument as a regex, such as `new RegExp()`,
`re.compile()`, or `Pattern.compile()`.

**Located regex**: A regex found in source code, with where it starts and ends: a literal, or a
string passed to a regex API call. _Avoid_: detected regex, match (a match is in the input)

**Supported language**: A language whose source code is searched for located regexes. Selections are
explained in every language. _Avoid_: enabled language

**Target**: The regex an action explains at a position: the selection containing it, else the
located regex under it. _Avoid_: current regex

## Explanations

**Explanation**: The plain-English account of a regex: its steps, match length, and flags, with any
backtracking warnings; or, for a pattern that does not parse, its syntax error.

**Step**: A piece of a pattern and what it does, such as `\d{3}` and "Match a digit (0-9), exactly 3
times". Steps nest under groups, quantifiers, and alternatives. _Avoid_: node, row, code point,
token

**Alternative**: One branch of a `|`. Explanations number them as Option 1, Option 2, and so on.
_Avoid_: branch, choice

**Match length**: The fewest and most characters a match of the regex can consume.

**Backtracking warning**: A warning that a quantifier can backtrack catastrophically, so rejecting
some inputs takes exponential or polynomial time. _Avoid_: ReDoS warning (ReDoS is the attack that
exploits it)

**Safe pattern**: An equivalent regex without the problem a backtracking warning describes, offered
when one can be derived. _Avoid_: fix, rewrite

## Matching

**Input**: The text a regex is matched against in the explanation panel. _Avoid_: test string,
sample

**Match**: One place the regex matches the input, with the lines it covers and its capture groups.
_Avoid_: hit, result

**Entry**: One line of the input, matched on its own when entries mode is on. _Avoid_: case, test
case, line (when it means an entry)

**Match limit**: The most matches listed for one input; past it, the results say they stopped early.
_Avoid_: cap, max results

## Extension

**Hover**: The explanation shown while the pointer rests on a target, with a button that opens it in
the explanation panel.

**Explanation panel**: The view beside the editor that shows one regex's explanation and matches it
against the input. _Avoid_: preview, match tester, webview

**Following**: The open explanation panel switching to the target the user moves the cursor to,
selects, hovers, or edits. _Avoid_: syncing, tracking
