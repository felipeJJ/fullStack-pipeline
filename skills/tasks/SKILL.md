---
name: tasks
description: Use when the user asks about pipeline tasks — listing open tasks, searching past tasks or bugfixes, reviewing a plan before execution, checking what was delivered in a task, or registering a task retroactively (hotfix done outside the pipeline).
---

# Task Registry

Local-first registry: fast to search, human-readable plans, no digging through `git log`. Lives in `.claude/pipeline/` of the project. All commands run through the CLI (`cliPath` in `.claude/pipeline/profile.json`): `node <cliPath> <command>`.

## Commands

| Command | Purpose |
|---|---|
| `new "<title>" --type=improvement\|bugfix --level=N` | Create task + plan file, prints `TASK-<id>` and plan path |
| `list [--status=planned\|in-progress\|ready\|done]` | Table of tasks |
| `search "<term>"` | Case-insensitive search across titles and plan file contents |
| `show <id>` | Full record: status, level, commit, attempts, plan path |
| `start <id>` | Mark in progress (one active task at a time) |
| `tdd-red <id>` / `tdd-skip <id> --reason="..."` | Confirm failing tests exist / justify absence — unblocks the TDD guard |
| `ready <id>` | Checklist done, cleared to commit — unblocks the commit gate |
| `done <id> --commit=<hash>` | Close task (the post-commit hook usually does this) |
| `note <id> "<text>"` | Append a timestamped note (decisions, context) |
| `rework <id> --area=X --reason="..."` | Record a review rejection / rework attempt (telemetry + attempt limit) |
| `usage <id> --json='[{"model":"sonnet","input":N,"output":N}]'` | Attach token usage per model (from OTel or /cost) for cost estimation |
| `report [--since=YYYY-MM-DD]` | Per-task wall time / attempts / est. cost + aggregation **per model matrix** (the A/B cost-comparison view) |
| `index` | Regenerate `INDEX.md` (auto-run by mutating commands) |

## Layout

- `tasks.json` — the structured registry (ids, status, level, commit hash, attempts, timestamps).
- `plans/TASK-<id>.md` — the human file: discovery Q&A, mini-tasks, contract, decisions. **This is what the user reads to evaluate a plan before authorizing execution.**
- `INDEX.md` — generated view, newest first. Never edit by hand.

## Retroactive registration

A hotfix committed outside the pipeline still gets registered: `new` with `--type=bugfix`, then `done --commit=<hash>`. The commit gate makes this rare by construction, but when it happens (gate skipped via `PIPELINE_SKIP_GATE=1`), register it as soon as noticed.
