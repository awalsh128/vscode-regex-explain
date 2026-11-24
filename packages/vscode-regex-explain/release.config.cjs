/**
 * Semantic-release configuration for the extension. The Publish Extension workflow runs it from
 * this directory; see CONTRIBUTING.md#publishing-the-extension.
 *
 * This is the repository's only release configuration: the extension and the library share one
 * version, with `v<version>` tags. Every commit counts, whichever package it changes, because the
 * extension bundles the library and the library is published at the same version. Releases never
 * commit: `main` only fast-forwards to `staging` (see .github/workflows/promote.yml), so the
 * version is written into package.json in the CI workspace only.
 */
module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    // Replaces @semantic-release/commit-analyzer. Node.js 24 loads it without a build step.
    "../../scripts/vscode-release/release-version.mts",
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    // Packages the VSIX for the GitHub release only. The workflow publishes it to the registries
    // with trusted publishing.
    ["semantic-release-vsce", { packageVsix: true, publish: false }],
    [
      "@semantic-release/github",
      { assets: [{ path: "*.vsix", label: "Extension package (VSIX)" }] },
    ],
  ],
};
