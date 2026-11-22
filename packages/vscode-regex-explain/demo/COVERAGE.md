# Demo coverage

| Feature                                                                                                                                                                                    | Scene                | Driven by | Reset                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------- | ---------------------------- |
| `source:registerHoverProvider`                                                                                                                                                             | hover-literal        | API       | none                         |
| Hover on a string passed to a regex API (Python)                                                                                                                                           | hover-python         | API       | none                         |
| Hover in Go, Rust, Java, C#, Ruby and PHP                                                                                                                                                  | hover-languages      | API       | none                         |
| Explain a selection in any file                                                                                                                                                            | selection            | API       | selection, editors           |
| Backtracking warning                                                                                                                                                                       | backtracking         | API       | none                         |
| `setting:regexExplain.checkBacktracking`                                                                                                                                                   | backtracking-setting | API       | the setting                  |
| `command:regexExplain.explain`<br>`menu:commandPalette:regexExplain.explain`<br>`source:createWebviewPanel`<br>`source:onDidChangeTextEditorSelection`<br>`source:onDidChangeTextDocument` | panel-follow         | API       | panel, editors               |
| `setting:regexExplain.panel.follow`                                                                                                                                                        | follow-off           | API       | the setting, panel           |
| `menu:editor/context:regexExplain.explain`                                                                                                                                                 | context-menu         | xdotool   | menu, panel                  |
| `source:showInputBox`                                                                                                                                                                      | command-input        | xdotool   | input, panel                 |
| Panel Input pane and match results                                                                                                                                                         | panel-match          | xdotool   | panel                        |
| `setting:regexExplain.hover.enabled`                                                                                                                                                       | hover-setting        | API       | the setting                  |
| Per-language override (`[python]`) of a setting                                                                                                                                            | language-override    | API       | global and `[python]` values |

Not demoed:

- `activation:onStartupFinished`: the extension is already active when the window settles, so there
  is nothing to see.
- `setting:regexExplain.hover.languages`: `hover-languages` shows six languages working, but no
  scene edits the list itself.
- Vue and Svelte hovers: their language ID comes from the Vue or Svelte extension, which the clean
  profile does not install.
