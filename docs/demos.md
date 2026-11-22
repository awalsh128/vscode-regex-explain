# Demos

Short recordings of each feature. The README shows the hover, the explanation panel and following
the cursor; the rest are here. Each loop is one idea, recorded at the size it is shown.

The GIFs are recorded by the scripts in `packages/vscode-regex-explain/demo/`, which are listed in
[`COVERAGE.md`](../packages/vscode-regex-explain/demo/COVERAGE.md) next to the feature each one
shows.

## Finding regexes

### In code, passed to a regex API

A pattern in a string passed to a regex API is found too, here `re.compile` in Python.

<img src="../packages/vscode-regex-explain/images/demo/hover-python.gif" alt="Hovering the pattern passed to re.compile in a Python file shows each capture group explained" width="800">

### In other languages

The same hover in Go, Rust, Java, C#, Ruby and PHP. The regex is found by parsing the file, so the
call that holds it decides what is explained.

<img src="../packages/vscode-regex-explain/images/demo/hover-languages.gif" alt="Hovering a pattern in Go, Rust, Java, C#, Ruby and PHP files shows the same step-by-step explanation" width="800">

### Any selected text

Select a pattern in any file, here a plain text file, then hover the selection.

<img src="../packages/vscode-regex-explain/images/demo/selection.gif" alt="Selecting a pattern in a text file and hovering it shows the explanation" width="800">

## Backtracking warnings

### A catastrophic pattern

A pattern that can backtrack catastrophically gets a warning at the top of its hover.

<img src="../packages/vscode-regex-explain/images/demo/backtracking.gif" alt="Hovering a regex that can backtrack catastrophically shows a warning above the explanation" width="800">

### Turning the warning off

Turn off `regexExplain.checkBacktracking` and the warning goes away; the explanation stays.

<img src="../packages/vscode-regex-explain/images/demo/backtracking-setting.gif" alt="With checkBacktracking turned off, the same hover shows the explanation without the warning" width="800">

## Opening the panel

### From the context menu

Right-click in the editor and choose **Regex Explain: Explain Regex**.

<img src="../packages/vscode-regex-explain/images/demo/context-menu.gif" alt="Choosing Regex Explain: Explain Regex from the editor context menu opens the explanation panel" width="800">

### With no regex under the cursor

When nothing is selected and the cursor is not in a regex, the command asks for a pattern to
explain.

<img src="../packages/vscode-regex-explain/images/demo/command-input.gif" alt="Running the explain command on an empty line asks for a pattern and then explains the one typed" width="800">

## Settings

### Hover explanations on and off

`regexExplain.hover.enabled` turns the hover off and back on.

<img src="../packages/vscode-regex-explain/images/demo/hover-setting.gif" alt="Turning regexExplain.hover.enabled off removes the hover, and turning it on restores it" width="800">

### One language only

Every setting can be set for a single language. Here hover is off for Python and still on in
TypeScript.

<img src="../packages/vscode-regex-explain/images/demo/language-override.gif" alt="With hover turned off for Python only, a Python regex shows no hover and a TypeScript regex still does" width="800">

### Keeping the panel on its regex

Turn off `regexExplain.panel.follow` and the panel keeps its regex while the cursor moves to
another.

<img src="../packages/vscode-regex-explain/images/demo/follow-off.gif" alt="With panel.follow turned off, moving the cursor to another regex leaves the panel on the first one" width="800">
