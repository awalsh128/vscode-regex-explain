# Scripts

Repository scripts, run with [tsx](https://tsx.is/) and tested by `npm run test:scripts`.

## `dev.ts`

`npm run check` (`dev.ts check`) verifies that related files agree and exits with status 1 on any
problem:

- Extension settings in `package.json` match the extension README's settings table, including
  defaults, and the `RegexExplainConfiguration` interface (`regexExplain.hover.enabled` maps to
  `hoverEnabled`).
- Extension commands are in `menus.commandPalette` and named in the README by ID and **title**.
- Only `configuration.ts` calls `getConfiguration(`.
- Every name exported from the library's `src/index.ts` appears in its README as `` `name` `` or
  `` `name(``.
- Every `.ts` file directly in each package's `src/` (not subdirectories such as `src/webview/`) and
  in `scripts/` has a `.test.ts` file with the same base name. Extension tests may be in `src/test/`
  or `src/test/integration/`.
- Each package's `LICENSE` copy matches the root `LICENSE` (npm and vsce only ship a license from
  the package directory).

The pre-commit hook runs it, and so does CI. It reads the working tree, not only staged changes.

`npm run setup` runs `npm install`, whose root `prepare` script enables the husky hooks in
`.husky/`, then `dev.ts setup`, which installs the extensions in `.vscode/extensions.json` with the
`code` CLI (listing them if the CLI is missing), and runs `npm run compile`.

## `vscode-release/release-version.mts`

A semantic-release `analyzeCommits` plugin that keeps releases on even minor versions and
pre-releases on odd ones, shipped by gh-dev-powerpack (do not edit it here; see
[CONTRIBUTING.md](../CONTRIBUTING.md#publishing-the-extension)). The extension's
`release.config.cjs` loads it directly, because Node.js 24 strips its types without a build step.

## `preview-panel.ts`

Renders the explanation panel's page with mock data, so you can see its layout and theme without
running the extension. It fills the real templates in `src/webview/`, bundles the real webview
script, and stands in for the VS Code API so that typing in the input lists matches with the
library's `findMatches`. Run it from the repository root, or with the **Preview Panel** task in VS
Code:

```sh
npm run preview-panel
```

It serves the page at `http://127.0.0.1:8765/` (`--port` changes the port) and rebuilds it whenever
a file in `packages/vscode-regex-explain/src/webview/` or `packages/regex-explain/src/` changes.
Each rebuild runs in a new process, so changes to `panel.ts`, `highlight.ts`, and the library apply
too. Open pages update by themselves: a change to `panel.css` alone swaps the stylesheet in place,
and other changes reload the page. Text typed in the input is kept across reloads. Stop it with
Ctrl+C.

`--theme` is `dark` (the default) or `light`, and `--out` sets where the files are written, by
default a `regex-explain-preview` folder in the system temporary directory. To write the files once
without serving them, add `--once` and open the `index.html` it prints:

```sh
npm run preview-panel -- --once --theme light --out /tmp/panel-preview
```

The page uses fixed colors for the VS Code theme variables, and the element upgrades come from the
bundled script, so it approximates the panel rather than matching it exactly.
