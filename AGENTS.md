# Repository Agent Instructions

Read [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) before making changes. Preserve unrelated
working-tree edits. The documentation policy below applies to every task, not just documentation
requests.

## Layout

This repository has two packages, each versioned and released on its own. Only the library is an npm
workspace member: npm requires unique names across a workspace, and both packages are named
`regex-explain` (the extension's name is part of its ID, `awalsh128.regex-explain`). The extension's
build dependencies are in the root `package.json`.

- [packages/regex-explain](packages/regex-explain): the `regex-explain` library. It has no VS Code
  dependency and is published to npm. It holds the core logic: explaining regexes, finding them in
  source code, and matching them against text.
- [packages/vscode-regex-explain](packages/vscode-regex-explain): the VS Code extension. It is not
  published to npm. It resolves the library through the root `node_modules/regex-explain` workspace
  link and bundles it with esbuild.

Core logic belongs in the library, which returns the data structures the extension needs. The
extension makes the VS Code API calls (documents, settings, hovers, commands, webviews), runs
untrusted patterns in a worker it can stop, and renders the library's results.
[docs/SOURCE_CODE.md](docs/SOURCE_CODE.md) describes each module.

## Required Documentation Review

Before completing a change, review the README of each package you changed against the current
implementation. Update it in the same change when the API, commands, settings, defaults,
requirements, or user-visible behavior change. If no README update is needed, say why in the
completion summary; do not make cosmetic edits just to satisfy the checklist.

- Library README: every name exported from
  [packages/regex-explain/src/index.ts](packages/regex-explain/src/index.ts) is documented, and
  examples match real output. Generate examples by running the code; do not write them by hand.
- Extension README: command IDs, titles, settings, and defaults match
  [packages/vscode-regex-explain/package.json](packages/vscode-regex-explain/package.json) and their
  handlers. Keep it to an overview, one example, settings, limitations, and troubleshooting.
- Distinguish implemented behavior from planned work. Do not invent versions, install counts, or
  test results.
- Keep development and publishing details in [CONTRIBUTING.md](CONTRIBUTING.md) or
  [scripts/README.md](scripts/README.md), and architecture in
  [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md).
- Validate changed JSON snippets, command IDs, settings, and local links. Report the checks you ran
  and anything left unverified.

`npm run check` verifies the mechanical parts of this list.

## Configuration Synchronization

When settings or their behavior change, update `contributes.configuration` in the extension
manifest, `RegexExplainConfiguration` and `DEFAULT_CONFIGURATION` in
[configuration.ts](packages/vscode-regex-explain/src/configuration.ts), the integration tests, and
the extension README together. Do not add speculative settings. Use `markdownDescription` for
setting help and keep `order` stable.

## Code Reuse and Conventions

Before adding a helper, constant, or settings read, search for an existing one and extend it. Each
concern has one owning module:

- Wording helpers (code spans, character names, articles):
  [text.ts](packages/regex-explain/src/text.ts).
- AST walking and explanation: [explainer.ts](packages/regex-explain/src/explainer.ts).
- Output formats: [render.ts](packages/regex-explain/src/render.ts) (`ExplanationRenderer`). The
  panel's markup and styles live beside its script in
  [src/webview](packages/vscode-regex-explain/src/webview) as Mustache templates, rendered by
  [panel.ts](packages/vscode-regex-explain/src/webview/panel.ts); do not build HTML in TypeScript
  strings.
- Settings: [configuration.ts](packages/vscode-regex-explain/src/configuration.ts). Other modules
  call `getConfig()`; `npm run check` fails on `getConfiguration(` anywhere else.
- Finding regexes in source text: [locator.ts](packages/regex-explain/src/locator.ts), with one
  query per language in [compiler.ts](packages/regex-explain/src/compiler.ts). Selections and
  caching per editor document: [targets.ts](packages/vscode-regex-explain/src/targets.ts).
- Matching text: [matches.ts](packages/regex-explain/src/matches.ts); the extension runs it in
  [matcher.ts](packages/vscode-regex-explain/src/matcher.ts)'s worker.

Prefer a maintained, typed npm package over hand-written parsing or analysis; see "Dependencies" in
[docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md). Match the surrounding code's documentation and
structure, and compare new code with a neighbor in the same module before finishing.

## Commit Messages

Write [Conventional Commits](https://www.conventionalcommits.org/): semantic-release derives the
next version and release notes from them, and the `commit-msg` hook rejects other messages. Pull
requests are squash-merged with the title as the commit subject, so CI lints only the pull request
title; give it the type and scope the whole change calls for. Use `fix:` and `feat:` only for
changes users of the library or extension see, since they trigger a release; use `docs:`, `ci:`,
`chore:`, `refactor:`, `test:`, or `build:` otherwise. Mark breaking changes with `!` or a
`BREAKING CHANGE:` footer; a breaking change to the library API is breaking even if the extension is
unaffected. The library counts only commits that change `packages/regex-explain/`; the extension
counts every commit. Extension releases use even minor versions and pre-releases odd ones (see
[CONTRIBUTING.md](CONTRIBUTING.md#publishing)). Branch from and target `staging`; `main` only
fast-forwards to it.

## Validation

Code changes require `npm run lint`, `npm run format:check`, `npm run check`, and `npm test`
(compiles, then runs unit and VS Code integration tests). Run `npm run test:scripts` when
[scripts](scripts) change. For documentation-only changes, validate examples, links, and
configuration syntax; do not claim that runtime tests were run unless they were.

## Agent Layout

AGENTS.md is the authoritative source of instructions for every tool. The tool-specific files below
only point here and add nothing that conflicts, so no precedence between them needs resolving.

- [CLAUDE.md](CLAUDE.md) imports these shared instructions for Claude Code.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) directs Copilot here.
- [.claude/agents/docs-reviewer.md](.claude/agents/docs-reviewer.md) and
  [.github/agents/docs-reviewer.agent.md](.github/agents/docs-reviewer.agent.md) are the read-only
  documentation reviewers for Claude Code and Copilot.

Use the documentation reviewer before completing user-facing changes when delegation is available;
otherwise perform its review directly. The main agent applies corrections and runs validation. Keep
policy here rather than duplicating it in tool-specific files.
