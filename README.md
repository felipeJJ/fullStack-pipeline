# fullStack-pipeline

A Claude Code plugin that packages a multi-agent TDD development workflow, extracted and generalized from months of daily use on a production ERP. It turns "process rules written in markdown" into a portable unit of skills + agents + hooks + scripts that works on any project via a small per-project profile.

## What it enforces

- **Tests first, structurally.** A PreToolUse hook blocks production edits while a task's failing tests aren't confirmed (`tdd-red`). Prose rules fail under context pressure; hooks don't.
- **Every commit belongs to a registered task.** The commit gate blocks `git commit` unless the active task passed its conclusion checklist; the post-commit hook records the hash and closes the task automatically. Unregistered hotfixes become structurally rare.
- **Tests are the spec.** Breaking an existing test forces an explicit user decision (intentional change vs regression) — no external spec document required, no silent behavior drift.
- **Complexity ratchet.** The reviewer runs a self-contained cyclomatic-complexity check on changed code: never exceed the error threshold, never get more complex than baseline. Untouched legacy is out of scope — no big-bang cleanups.
- **Role separation.** Generic `tester` / `dev` / `reviewer` agents with strict boundaries (testers never write production code, devs never decide architecture, the reviewer never fixes code), instantiated per *area* — one, two, or five areas, not a hardcoded back/front pair.

## Install

```bash
# local development
claude --plugin-dir /path/to/fullStack-pipeline

# from GitHub (after publishing)
/plugin install <user>/fullStack-pipeline
```

Then, inside a project: run the `init-profile` skill once. It detects your areas, interviews you for the rest, and writes `.claude/pipeline/profile.json`. Projects without a profile are untouched by the hooks — the plugin is opt-in per project.

## Daily use

Start any task with the `pipeline` skill. Flow: register + discovery → plan (reviewable file under `.claude/pipeline/plans/`) → red tests → implementation → review → conclusion + auto-registered commit. Task lookup is local and instant (`tasks` skill: list / search / show) — no digging through `git log`.

Complexity levels (1-5, decided with the user) pick the orchestration mechanics: plain subagents for small fixes, named agents with message coordination for real features, phased execution with incremental review for architectural work.

## Layout

```
.claude-plugin/plugin.json    manifest
skills/pipeline/              orchestrator skill (+ references/)
skills/init-profile/          per-project setup interview
skills/tasks/                 registry usage
agents/{tester,dev,reviewer}  generic personas, parameterized by area
hooks/hooks.json              tdd-guard, commit-gate, post-commit
scripts/task-cli.js           local registry (tasks.json + plans/ + INDEX.md)
scripts/complexity-check.js   dependency-free complexity ratchet
```

## Escape hatch

`PIPELINE_SKIP_GATE=1 git commit ...` bypasses the commit gate for genuinely exceptional commits; register them retroactively (`tasks` skill).

## Status / roadmap

- **v0.1** — this: extracted architecture, hooks, registry, generic agents.
- **Next** — field validation: run a real level-3 task on a production project via `--plugin-dir`, capture failures, tighten wording (skill-TDD REFACTOR phase). Then a second project with a different area shape.
