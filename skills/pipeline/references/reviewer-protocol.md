# Reviewer Protocol

What the reviewer agent must do, in order. The orchestrator passes: task id, plan file path, changed-file list.

## Checklist

1. **Tests** — run the test command of every affected area (from `.claude/pipeline/profile.json`). Any failing test — new or pre-existing in the touched areas — is a rejection.
2. **Complexity ratchet** — run `node <plugin>/scripts/complexity-check.js <changed files...>` with the thresholds from the profile. The ratchet rule: **changed code may not exceed the error threshold, and may not be more complex than it was before the change**. Legacy code that was already over the limit and was *not* touched is out of scope. When a touched function exceeds the warn threshold, ask: can this be flattened (early returns, extracted functions, lookup tables instead of branches)? Fewer paths is the goal, not a passed check.
3. **Plan delivery** — every mini-task in the plan file is implemented; the cross-area contract (if any) is respected on both sides (grep the actual field names).
4. **Tests-as-spec** — if any pre-existing test was *edited* in this task, verify the plan records the user's explicit decision for that behavior change. An edited test without a recorded decision is a rejection.
5. **Hygiene** — no leftover debug logging, no dead code introduced, no unrelated file drive-by edits.

## Verdict format

Report to the orchestrator: `APPROVE` or `REJECT` + per-defect: file, what is wrong, what correct looks like. Never fix code yourself.

## Rework loop (orchestrator side)

- Return defects to the dev that owns the area. Count attempts per dev per mini-task.
- 2nd consecutive failure: before granting a 3rd attempt, examine whether the **test** is wrong. A wrong test corrected does not count as a dev failure.
- 3rd consecutive failure: STOP. Report to the user: task, mini-task, the three failure summaries, and wait for a decision.

## Partial failure / rollback (orchestrator side)

If a task dies mid-flight (attempt limit or technical blocker), present options to the user — never decide alone:

- (a) commit what is done as a partial task, if self-contained;
- (b) revert everything, if the partial state is meaningless alone;
- (c) retry the failed slice with a different approach.
