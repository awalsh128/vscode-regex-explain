<p align="center">
  <img src="packages/vscode-regex-explain/images/logo.png" alt="Regex Explain logo" width="128" height="128">
</p>

<h1 align="center">Regex Explain</h1>

Explains regular expressions in plain English and warns about catastrophic backtracking. This
repository has two packages, each versioned and released on its own:

| Package                                                    | What it is                                                                                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`regex-explain`](packages/regex-explain)                  | A TypeScript library on npm that explains a regex as a tree of steps, finds regexes in source code, and lists a regex's matches in text |
| [Regex Explain for VS Code](packages/vscode-regex-explain) | A VS Code extension that shows those explanations on hover and in a panel beside the code, with a match tester                          |

See each package's README for usage. Contributor setup, testing, and publishing are in
[CONTRIBUTING.md](CONTRIBUTING.md); architecture is in [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md).

## License

Apache-2.0
