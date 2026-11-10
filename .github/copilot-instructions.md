# GitHub Copilot Instructions

Read and follow [AGENTS.md](../AGENTS.md), the shared repository instructions, and
[docs/AI_GUIDELINES.md](../docs/AI_GUIDELINES.md). The required documentation review in AGENTS.md
applies before completing every task: keep each package README accurate to the current code, or
explain why no update is needed. Use the `docs-reviewer` agent for that review when available.

When settings change, apply the Configuration Synchronization policy in AGENTS.md so the manifest,
`configuration.ts`, tests, and extension README stay aligned.

Validation is listed in AGENTS.md:

```sh
npm run lint
npm run format:check
npm run check
npm test
```
