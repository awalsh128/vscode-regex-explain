# Claude Code Instructions

@AGENTS.md

Read [docs/AI_GUIDELINES.md](docs/AI_GUIDELINES.md) before editing code, and apply the required
documentation review from the shared instructions before completing every task.

## Project Subagents

Project subagents live in [.claude/agents](.claude/agents); Claude Code discovers them from their
frontmatter. Use `docs-reviewer` for a read-only review of the READMEs against the code after
user-facing changes. Give it the task scope and changed files, then apply its findings in the main
conversation. Do not grant it write or shell access. If a new agent is not discovered in an existing
session, restart the session.
