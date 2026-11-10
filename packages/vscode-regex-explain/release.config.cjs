/**
 * Semantic-release configuration for the extension. The Publish Extension workflow runs it from
 * this directory; see CONTRIBUTING.md#publishing-the-extension.
 *
 * The extension is versioned on its own, with `v<version>` tags. Every commit counts, not only
 * those under this directory, because the extension bundles the library. Releases never commit:
 * `main` only fast-forwards to `staging` (see .github/workflows/promote.yml), so the version is
 * written into package.json in the CI workspace only.
 */
module.exports = {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    // Replaces @semantic-release/commit-analyzer; compiled to out/ by `tsc -b`.
    "../../out/scripts/release-version.js",
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    // Packages the VSIX for the GitHub release only. The plugin reads registry credentials from
    // tokens, so the workflow publishes with `npm run ops -- publish` (trusted publishing).
    ["semantic-release-vsce", { packageVsix: true, publish: false }],
    [
      "@semantic-release/github",
      { assets: [{ path: "*.vsix", label: "Extension package (VSIX)" }] },
    ],
  ],
};
