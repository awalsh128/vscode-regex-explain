/**
 * Semantic-release configuration for the npm library. The Publish Library workflow runs it from
 * this directory with semantic-release-monorepo, which keeps only the commits that change this
 * directory; see CONTRIBUTING.md#publishing-the-library.
 *
 * The library is versioned on its own, with `regex-explain-v<version>` tags. Releases never commit:
 * `main` only fast-forwards to `staging` (see .github/workflows/promote.yml), so the version is
 * written into package.json in the CI workspace only.
 */
module.exports = {
  branches: [
    // Release candidates, such as 1.1.0-rc.1, tagged with a GitHub prerelease but not published.
    { name: "staging", prerelease: "rc" },
    // Official releases, such as 1.1.0, cut when promote.yml fast-forwards main to staging.
    "main",
  ],
  tagFormat: "regex-explain-v${version}",
  plugins: [
    ["@semantic-release/commit-analyzer", { preset: "conventionalcommits" }],
    ["@semantic-release/release-notes-generator", { preset: "conventionalcommits" }],
    // Only main publishes: npm trusts publish-library.yml when it is started on its own, while
    // candidates run it through ci.yml.
    ["@semantic-release/npm", { npmPublish: process.env.GITHUB_REF === "refs/heads/main" }],
    "@semantic-release/github",
  ],
};
