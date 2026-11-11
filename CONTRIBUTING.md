# Contributing

## Prerequisites

- [Node.js](https://nodejs.org/) 22.13 or later (CI uses Node.js 24)
- [Visual Studio Code](https://code.visualstudio.com/) 1.100 or later

## Getting Started

```sh
git clone https://github.com/awalsh128/vscode-regex-explain.git
cd vscode-regex-explain
npm run setup
```

`npm run setup` installs dependencies, which also enables the
[husky](https://typicode.github.io/husky/) Git hooks in `.husky/` (pre-commit runs `npm run check`;
commit-msg checks for Conventional Commits), installs the recommended VS Code extensions, and builds
everything. Any `npm install` enables the hooks, through the root `prepare` script.

Then press <kbd>F5</kbd> (**Run Extension**) to open an Extension Development Host on
`packages/vscode-regex-explain/test-workspace/`, which has sample files to hover.

## Development Workflow

All changes follow [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) and the documentation policy in
[AGENTS.md](AGENTS.md).

1. Create a branch: `git checkout -b feat/short-name`.
2. Write or update tests first. Every `.ts` file needs a matching `.test.ts` file.
3. Make the change. Explanation logic goes in the library, editor behavior in the extension.
4. Validate:

   ```sh
   npm run lint          # ESLint
   npm run format:check  # Prettier (npm run format to fix)
   npm run check         # docs, settings, commands, exports, and test files agree
   npm test              # compile, unit tests, then integration tests in VS Code
   npm run test:scripts  # when scripts/ change
   ```

5. Update the package READMEs and [docs/SOURCE_CODE.md](docs/SOURCE_CODE.md) as needed.

`npm test` downloads VS Code into `.vscode-test/` on its first run and opens a test window. On a
machine without a display, run it under `xvfb-run -a npm test`, as CI does. Run only some
integration tests with `MOCHA_GREP="RegexHoverProvider" npm run test:integration`.

`npm run test:mutation` runs [StrykerJS](https://stryker-mutator.io/) on the library: it mutates
`packages/regex-explain/src/*.ts` and reports each mutant the unit tests fail to catch. A full run
takes several minutes, so it is not part of `npm test` or CI. The report is written to
`reports/mutation/index.html`, and later runs reuse `reports/stryker-incremental.json` to test only
changed code. Use it to find gaps in tests for code you changed; the unit tests must pass first.

The extension icon is `packages/vscode-regex-explain/images/logo.png`, rendered from `logo.svg` in
the same directory. After editing the SVG, render it again at 256×256, for example with
`inkscape logo.svg --export-type=png --export-filename=logo.png -w 256 -h 256`.

## Pull Requests

Pull requests target `staging`; the Pull Request workflow rejects any other base branch, because
`main` is only updated by [promotion](#branches). Keep pull requests focused, describe what changed
and why, and link related issues. CI runs lint, format, consistency checks, all tests, and a
dependency audit; the Pull Request workflow adds a dependency review and runs commitlint on the pull
request title.

Pull requests are squash-merged, and the squashed commit takes the pull request title as its subject
and the description as its body. The title is the only message that reaches `staging`, so it must be
a [Conventional Commit](https://www.conventionalcommits.org/); the messages of the commits inside
the pull request are not checked in CI. Split changes that need separate release notes, such as a
`feat` and an unrelated `fix`, into separate pull requests.

## Publishing

Releases are versioned by [semantic-release](https://semantic-release.gitbook.io/) from the commit
messages on `staging`, which are the squashed [pull request titles](#pull-requests). The library and
the extension are versioned and released separately:

| Package                   | Workflow                                                         | Tags                   | Configuration                                                                                        |
| ------------------------- | ---------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `regex-explain`           | [publish-library.yml](.github/workflows/publish-library.yml)     | `regex-explain-vX.Y.Z` | [packages/regex-explain/release.config.cjs](packages/regex-explain/release.config.cjs)               |
| Regex Explain for VS Code | [publish-extension.yml](.github/workflows/publish-extension.yml) | `vX.Y.Z`               | [packages/vscode-regex-explain/release.config.cjs](packages/vscode-regex-explain/release.config.cjs) |

| Commit                                                       | Calls for |
| ------------------------------------------------------------ | --------- |
| `fix: ...`, `perf: ...`                                      | patch     |
| `feat: ...`                                                  | minor     |
| `feat!: ...` or a `BREAKING CHANGE:` footer                  | major     |
| `docs:`, `ci:`, `chore:`, `refactor:`, `test:`, `build:` ... | none      |

The library counts only commits that change `packages/regex-explain/`
([semantic-release-monorepo](https://github.com/pmowrer/semantic-release-monorepo)). The extension
counts every commit, because it bundles the library.

Releases never commit. The committed `package.json` files keep the placeholder version `0.0.0`, and
semantic-release writes the real version into them in the CI workspace only. The tags and GitHub
releases are the version history.

### Branches

`main` is always an ancestor of `staging`: it only ever points at a commit that is already on
`staging`, and never has commits of its own.

- Feature branches target `staging`. A `staging` ruleset should require a pull request with passing
  CI and Pull Request checks, and block force pushes and deletion.
- Promote with the **Promote staging to main** workflow
  ([promote.yml](.github/workflows/promote.yml)), run by hand. It requires a successful CI run on
  `staging`'s latest commit, fast-forwards `main` to it, then starts the library's official release.
  It fails rather than force-pushing if `main` has commits that `staging` doesn't.
- The `main` ruleset should block every update except from the
  [Octo STS](https://github.com/octo-sts/app) GitHub App, whose token the promote workflow uses (see
  [Release Credentials](#release-credentials)).
- Never merge into `main` with a pull request: merge, squash and rebase merges all add a commit to
  `main` that `staging` doesn't have.

Release jobs install dependencies with `--ignore-scripts`, because they can mint registry and GitHub
tokens.

### Release Credentials

The workflows store no secrets. Each job exchanges its GitHub OIDC token (`id-token: write`) for
short-lived credentials:

| Credential              | Used by                                                                        | Issued under                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| GitHub token for `main` | `promote.yml` on `staging`                                                     | Octo STS trust policy [promote.sts.yaml](.github/chainguard/promote.sts.yaml)                   |
| GitHub token for tags   | The `semantic-release` action in both publishing workflows on `main`/`staging` | Octo STS trust policy [release.sts.yaml](.github/chainguard/release.sts.yaml)                   |
| Registry credentials    | `publish-library.yml` and the extension's publish job                          | Each registry's [trusted publishers](#trusted-publishing), which name the `release` environment |

GitHub rejects tag creation and updates to `main` by `GITHUB_TOKEN` under the rulesets, so those go
through the [Octo STS](https://github.com/octo-sts/app) GitHub App, which mints a token when a job's
OIDC token matches a trust policy in `.github/chainguard/`. Setup:

1. [Install the Octo STS app](https://github.com/apps/octo-sts/installations/new) on this
   repository.
2. Add the app as a bypass actor to the `main` ruleset and to the ruleset that restricts tag
   creation.
3. Restrict the `release` environment to `main` and `staging`. The registries trust only jobs in it.

Octo STS reads trust policies from the default branch (`main`), so a policy change takes effect when
it is promoted. The policies match the owner and repository IDs in the OIDC subject, the branch, and
the exact workflow file.

The extension's tagging job runs outside the `release` environment, so semantic-release and its
plugins never hold an OIDC token that a registry accepts; its publish job, in the environment,
publishes the GitHub release's VSIX. The library can't be split this way, because semantic-release
publishes it to npm.

semantic-release and its plugins are locked in
[.github/actions/semantic-release/package-lock.json](.github/actions/semantic-release/package-lock.json),
apart from the root workspace. To update them, edit that directory's `package.json` and run
`npm install --package-lock-only --ignore-scripts` there.

### Publishing the Library

Every library release is gated by CI on the exact commit being released:

| Branch    | Releases                   | Example      | Started by                                       |
| --------- | -------------------------- | ------------ | ------------------------------------------------ |
| `staging` | Release candidates         | `1.2.0-rc.1` | The last CI job on a `staging` push, after tests |
| `main`    | Official (stable) releases | `1.2.0`      | The promote workflow                             |

- Each release candidate increments the `rc` number until the version is promoted. Candidates get a
  tag and a GitHub prerelease, but are not published to npm.
- Official releases publish to npm through trusted publishing, with provenance. npm trusts only
  `publish-library.yml` started on its own, which candidates are not (ci.yml calls it).
- Manual runs first require a successful CI run for the commit. Start one with `dry-run: true` to
  preview the next version without tagging:

  ```sh
  gh workflow run publish-library.yml --ref staging -f dry-run=true
  ```

### Publishing the Extension

Versions follow VS Code's
[pre-release convention](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions):
releases use even minor versions (1.0.x, 1.2.x) and pre-releases odd ones (1.1.x, 1.3.x).
[scripts/release-version.ts](scripts/release-version.ts) turns the commits into a bump that keeps
that split:

| Last version | Run         | Commits             | Next version    |
| ------------ | ----------- | ------------------- | --------------- |
| 1.0.2        | pre-release | `fix` or `feat`     | 1.1.0           |
| 1.1.0        | pre-release | `fix` or `feat`     | 1.1.1           |
| 1.1.1        | release     | any, including none | 1.2.0 (promote) |
| 1.2.0        | release     | `fix`               | 1.2.1           |
| any          | release     | breaking            | next major      |

Features go out as a pre-release first: a release run refuses `feat` commits after a release, since
it would have to skip an odd minor.

Start the **Publish Extension** workflow by hand on `main`, usually after a promotion. It defaults
to a dry run that prints the next version and release notes:

```sh
gh workflow run publish-extension.yml --ref main -f dry-run=false                     # release
gh workflow run publish-extension.yml --ref main -f dry-run=false -f pre-release=true # pre-release
```

After checking that CI passed on the commit, a run:

1. Computes the version from the commits since the last `v*` tag. Without `fix` or `feat` commits it
   publishes nothing.
2. Tags `vX.Y.Z` and creates a GitHub release with the notes and the packaged VSIX.
3. Publishes that release's VSIX to the Visual Studio Marketplace and Open VSX with
   `npm run ops -- publish --vsix` ([scripts/ops.ts](scripts/ops.ts)), at the version of the newest
   `v*` tag on the commit, skipping a registry that already has it. After a partial failure, use
   **Re-run failed jobs**: the commit already carries the tag, so the rerun publishes it to the
   remaining registries.

`npm run ops -- publish --dry-run` packages the VSIX and lists the registries that do not have the
version yet, from any machine.

### Trusted Publishing

Every registry is reached with trusted publishing: the job's GitHub OIDC token is exchanged for
short-lived credentials. Each registry must list this repository, the workflow file, and the
`release` environment as a trusted publisher:

| Registry            | Workflow                | Where to configure it                                                                                                                                                                                                |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm                 | `publish-library.yml`   | The package's settings on npmjs.com ([npm trusted publishing](https://docs.npmjs.com/trusted-publishers)). Trusted publishers are set on an existing package, so a new package's first version is published by hand. |
| VS Code Marketplace | `publish-extension.yml` | The `awalsh128` publisher's trusted publishers; `vsce publish --oidc` exchanges the token.                                                                                                                           |
| Open VSX            | `publish-extension.yml` | The namespace's [trusted publishers](https://open-vsx.org/user-settings/trusted-publishers); `ops.ts` exchanges the token for a publishing token.                                                                    |

Run a dry run of the matching workflow after changing a `release.config.cjs`. A dry run checks the
configuration but does not publish.

## License

By contributing, you agree that your contributions are licensed under the Apache-2.0 License.
