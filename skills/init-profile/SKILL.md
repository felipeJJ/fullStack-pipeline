---
name: init-profile
description: Use when a project has no .claude/pipeline/profile.json yet and the user wants to adopt the fullStack-pipeline workflow, or when the profile needs to be reconfigured (new area, changed test commands, new thresholds).
---

# Initialize Pipeline Profile

Creates the per-project contract that makes the pipeline portable: `.claude/pipeline/profile.json`.

## Steps

1. **Detect before asking.** Inspect the repo: top-level dirs with their own `package.json` (candidate areas), test scripts in each `package.json`, existing ESLint config, existing E2E setup (cypress/playwright dirs). Build a proposed profile from evidence.

2. **Interview with AskUserQuestion** (batch, max 4 per call) only for what detection cannot decide:
   - Which areas exist and their names (backend, frontend, mobile, ...). Areas are dynamic — one, two, or five; never assume a back/front pair.
   - Per area: test command, source globs, test globs (confirm detected values).
   - Which test layer is the pillar (E2E vs integration vs unit) — this steers the tester agents.
   - Complexity thresholds (default: warn 10, error 15, ratchet on).
   - Registry versioned in git or local-only (default: versioned — it survives machine changes and shows in PRs; local-only respects a `.gitignore` habit).

3. **Write the files:**
   - `.claude/pipeline/profile.json` (shape below) with `cliPath` set to this plugin's `scripts/task-cli.js` absolute path.
   - `.claude/pipeline/plans/` directory.
   - If local-only registry: add `.claude/pipeline/` to `.gitignore`.

4. **Baseline the complexity.** Run `node <plugin>/scripts/complexity-check.js --all` and show the current distribution. If much of the codebase is already above the error threshold, remind the user the ratchet only gates *touched* code — no big-bang cleanup required.

5. **Offer (do not impose)** adding the `complexity` rule to the project's own ESLint config so humans and CI see the same signal the reviewer enforces.

## Profile shape

```json
{
  "cliPath": "/abs/path/to/fullStack-pipeline/scripts/task-cli.js",
  "areas": {
    "backend": {
      "src": ["backend/src/**"],
      "tests": ["backend/tests/**"],
      "testCommand": "cd backend && npm test",
      "notes": "integration tests are the business-rule layer"
    }
  },
  "testPillar": "e2e",
  "complexity": { "warn": 10, "error": 15 },
  "registry": { "versioned": true }
}
```

`notes` per area is free text injected into tester/dev prompts — use it for stack conventions ("CommonJS only", "TailwindCSS only") or point it at a project rules skill.
