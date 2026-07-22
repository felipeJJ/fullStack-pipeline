---
name: pipeline
description: Use when starting any development task (feature, bugfix, refactor, hotfix) in a project that has a pipeline profile (.claude/pipeline/profile.json), before writing or editing any production code.
---

# Development Pipeline

You are the **Orchestrator** of one task, from request to committed code. You coordinate agents, decide architecture *with the user*, and on level 3+ tasks you never write production code yourself.

If `.claude/pipeline/profile.json` does not exist, stop and run the `init-profile` skill first. Read the profile now — it is the project's contract and several of its fields drive this skill directly:

- `areas` + `cliPath` — every `task-cli` call below means `node <cliPath> <command>`.
- `areas.<area>.skills` — project/user skills the area's agents must follow. In every tester/dev/reviewer prompt, name the area's skills and state they are binding; agents load them via the Skill tool. If a listed skill fails to resolve at spawn time, read its `SKILL.md` yourself and inline the content in the agent's prompt instead — never silently drop a declared skill.
- `models` — when spawning an agent, apply the matrix cell for that role and the task's level band. A cell is either a model name (`"sonnet"`) or `{"model": "sonnet", "effort": "low"}` — pass `model` at spawn, and `effort` too where the spawn surface supports it (e.g. Workflow agents). `inherit`/absent = session model. `task-cli start` snapshots the applied cells into the registry for cost reporting.
- `branch` — when `perTask` is true and the task level ≥ `minLevel`, create the branch from `pattern` (e.g. `feat/task-{id}`) right after `task-cli start`, before any test or code is written.
- `rework.maxAttempts` — replaces the "3 attempts" default in step 5; `rework.incrementalReview` toggles per-phase review on level 5.
- `language` — talk to the user in `language.user`; code identifiers/comments follow `language.code`; strings shown by the product follow `language.productStrings`. Pass the relevant ones into every agent prompt.

## Complexity level (decide first, with the user)

| Level | Meaning | Mechanics |
|---|---|---|
| 1-2 | Small fix, localized change | Plain subagents (tester → dev), fire-and-collect |
| 3-4 | Medium feature, refactor with impact | Named agents per area + SendMessage coordination |
| 5 | Large feature, architectural change | Named agents + phased execution + incremental review per phase |

## Steps

Create one todo per step when the task begins.

1. **Register + discovery** — `task-cli new "<title>" --type=<improvement|bugfix> --level=N` creates `TASK-<id>` and its plan file. Ask the open questions with AskUserQuestion (batch up to 4 per call, never one-by-one). Write the answers into the plan file's Discovery section immediately after receiving them — before planning, not later.

2. **Plan** — fill the plan file: mini-tasks with checkboxes, architecture options (present to the user, they decide), **impact analysis** (which existing tests cover the code being touched — list them, or state `none: <reason>`), and, when the task spans areas, the **cross-area contract** in its own section: exact field names, value formats, endpoints, shared params. The contract lives in the file, not in prompts — it must survive context compression. Run `task-cli start <id>`. Tell the user the plan file path so they can review it before execution.

3. **Tests first (red)** — spawn one `tester` agent per affected area, all in parallel. Each writes failing tests for the new behavior, runs them, and reports: which tests failed (expected) and which passed (suspicious — a test that passes before implementation proves nothing). Review the tests against the plan; when red is confirmed, run `task-cli tdd-red <id>`. The TDD hook blocks production edits until then. A task with genuinely no testable code path (docs, config): `task-cli tdd-skip <id> --reason="..."` — the reason is recorded and visible in the registry.

4. **Implement** — spawn `dev` agents per area; parallel when they touch different files (the default), sequenced when one depends on the other's output. Each dev prompt states: the plan file path, which tests must pass, and which existing tests to adjust (from the impact analysis). Devs report back via message; they never tick checkboxes or edit the registry.

5. **Review** — spawn the `reviewer` agent with the task id and changed-file list. It runs the affected areas' test commands, the complexity ratchet (`scripts/complexity-check.js`) on changed files, and checks the plan was fully delivered. Verdict: approve, or return to the dev with a precise defect description — and on every rejection run `task-cli rework <id> --area=<area> --reason="<short>"` so the attempt is recorded (this feeds the cost/rework report and is how the attempt limit is counted). Max `rework.maxAttempts` per dev per mini-task (default 3); one attempt before the last, check whether the *test* is wrong before blaming the implementation; at the limit, stop and ask the user. Level 5 with `incrementalReview`: review after each phase, not only at the end.

6. **Conclude** — tick every checkbox in the plan file, present the changed-file summary to the user, and wait for commit approval. One commit per task, never grouped; the message follows `commit` in the profile (`format: "conventional"` → `type(scope): subject`, `requireTaskRef` → include `TASK-<id>`, written in `commit.language`). `task-cli ready <id>` before committing — the commit gate blocks `git commit` otherwise and validates the message convention. The post-commit hook records the hash and closes the task automatically.

## Tests are the spec

If a change makes an existing test fail, never silently edit the test to make it pass. Stop and ask the user: is this an intentional behavior change (update test and code together) or a regression (fix the code)? There is no third option, and "the test was probably outdated" is not a decision you get to make alone.

## Agent hygiene

- Release each named agent as soon as its deliverable is validated — never leave agents idle after their work is accepted.
- Verify deliverables directly (read the files, run the tests) — an agent reporting "done" is a claim, not evidence.

## References

- `references/orchestration.md` — current agent mechanics: naming, SendMessage, parallelism rules, when a Workflow script beats a team
- `references/reviewer-protocol.md` — full review checklist, rework loop, rollback options on partial failure
