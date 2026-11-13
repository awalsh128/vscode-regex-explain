<p align="center">
  <img src="packages/vscode-regex-explain/images/logo.png" alt="Regex Explain logo" width="128" height="128">
</p>

<h1 align="center">Regex Explain Lab</h1>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.regex-explain"><img src="https://vsmarketplacebadges.dev/version/awalsh128.regex-explain.svg?label=Version&color=%2314b8a6" alt="Version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=awalsh128.regex-explain"><img src="https://vsmarketplacebadges.dev/downloads/awalsh128.regex-explain.svg?label=Marketplace%20downloads&color=blueviolet" alt="Marketplace downloads"></a>
  <a href="https://open-vsx.org/extension/awalsh128/regex-explain"><img src="https://img.shields.io/open-vsx/dt/awalsh128/regex-explain?label=Open%20VSX%20downloads&color=blueviolet" alt="Open VSX downloads"></a>
  <a href="https://github.com/awalsh128/vscode-regex-explain/actions/workflows/ci.yml"><img src="https://github.com/awalsh128/vscode-regex-explain/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/awalsh128/vscode-regex-explain/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License"></a>
</p>

Explains regular expressions in plain English and warns about catastrophic backtracking. This
repository has two packages, each versioned and released on its own:

| Package                                                    | What it is                                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`regex-explain`](packages/regex-explain)                  | A TypeScript library on npm that explains a regex as a tree of steps, finds regexes in source code, and lists a regex's matches in text             |
| [Regex Explain for VS Code](packages/vscode-regex-explain) | A VS Code extension that shows those explanations on hover and in a panel beside the code, where you can also match the regex against your own text |

See each package's README for usage. Contributor setup, testing, and publishing are in
[CONTRIBUTING.md](CONTRIBUTING.md); architecture is in [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md).

## License

Apache-2.0
