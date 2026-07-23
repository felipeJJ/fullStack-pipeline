---
name: init-profile
description: Use when a project has no .claude/pipeline/profile.json yet and the user wants to adopt the fullStack-pipeline workflow, or when the profile needs to be reconfigured (new area, changed test commands, new thresholds).
---

# Initialize Pipeline Profile

Creates the per-project contract that makes the pipeline portable: `.claude/pipeline/profile.json`.

## Steps

1. **Detect before asking.** Inspect the repo: top-level dirs with their own `package.json` (candidate areas), test scripts in each `package.json`, existing ESLint config, existing E2E setup (cypress/playwright dirs). Build a proposed profile from evidence.

1.5. **Ensure a CLAUDE.md exists.** The pipeline depends on it: plans and agents are only as good as the project context they read. Check the repo root:
   - **Missing** → tell the user it's a prerequisite and offer (AskUserQuestion): (a) generate it now through a short interview (recommended — use the template below), (b) run Claude Code's `/init` generator and then trim it to the template's shape, or (c) skip for now — record the gap and warn that plans will be generic until it exists.
   - **Present** → skim it. If it lacks a product overview, permanent decisions, or a "never" list, suggest (don't impose) filling those gaps.

   **The "Never" question is mandatory in the interview** (and whenever an existing CLAUDE.md has no Never section): ask the user directly, in their own words, which things agents must **never** do in this project — the one section that cannot be inferred from code, only from the owner. Prime with examples of the genre: *"never hard-delete — always soft delete"*, *"never commit/push without my explicit approval"*, *"never install new styling libraries"*, *"never touch production data"*. Use AskUserQuestion (free text via "Other" is fine) or a direct question; accept one item or many. Record the answers **verbatim** as bullets under `## Never` — don't soften or paraphrase them; their bluntness is what makes agents respect them. These rules are enforced downstream: agents treat them as binding and the reviewer rejects violations.

   Template — keep it lean, agents read it whole:
   - **Overview**: what the product is, who uses it, the 5-line architecture (stack per area, deploy).
   - **Domain glossary**: terms that mean something specific in this product (the entries a newcomer would get wrong).
   - **Permanent decisions**: intentional choices an agent must not "fix" (with the why).
   - **Never**: the hard rules (things that look like improvements but are forbidden).
   - **Pointers**: links to deeper docs *with when-to-read guidance* (e.g. "touching payments → read docs/billing.md") — pointers keep CLAUDE.md small while making depth discoverable.

2. **Interview with AskUserQuestion** (batch, max 4 per call) only for what detection cannot decide. First question is always the **preset** — it fills every default below, and the remaining questions only cover the areas and whatever the user wants to deviate:

   | Preset | Intent | Defaults |
   |---|---|---|
   | `strict` | Production code, quality first | TDD guard blocking, commit gate blocking, reviewer on the strongest model at every level, per-task branches, conventional commits with task ref |
   | `balanced` | The battle-tested default | TDD guard blocking, commit gate blocking, cheap testers / mid devs / strong reviewer on L3+, branch and commit convention asked |
   | `prototype` | Exploration, speed first | TDD guard advisory, commit gate advisory, cheapest models everywhere, no branch policy, no commit convention |

   Then ask:
   - Which areas exist and their names (backend, frontend, mobile, ...). Areas are dynamic — one, two, or five; never assume a back/front pair.
   - Per area: test command, source globs, test globs (confirm detected values).
   - **Model matrix** — which model each role (tester/dev/reviewer) uses per level band (1-2, 3-4, 5). Present the preset's suggestion and let the user adjust; `inherit` means "use the session's model".
   - Which test layer is the pillar (E2E vs integration vs unit) — this steers the tester agents.
   - Complexity thresholds (default: warn 10, error 15, ratchet on).
   - Registry versioned in git or local-only (default: versioned — it survives machine changes and shows in PRs; local-only respects a `.gitignore` habit).
   - **Languages** — user interaction language vs code/comment language vs user-facing strings in the product (they often differ; record all three).

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
  "preset": "balanced",
  "areas": {
    "backend": {
      "src": ["backend/src/**"],
      "tests": ["backend/tests/**"],
      "testCommand": "cd backend && npm test",
      "skills": ["backend-rules"],
      "notes": "integration tests are the business-rule layer"
    }
  },
  "testPillar": "e2e",
  "models": {
    "tester":   { "1-2": { "model": "haiku", "effort": "low" }, "3-4": "sonnet", "5": "sonnet" },
    "dev":      { "1-2": "sonnet", "3-4": "sonnet", "5": "opus" },
    "reviewer": { "1-2": "sonnet", "3-4": "opus",   "5": "opus" }
  },
  "prices": null,
  "tdd": { "mode": "strict", "exempt": ["**/*.md", "**/*.json", "**/migrations/**"] },
  "branch": { "perTask": true, "minLevel": 3, "pattern": "feat/task-{id}" },
  "commit": { "mode": "strict", "format": "conventional", "requireTaskRef": true, "language": "en" },
  "rework": { "maxAttempts": 3, "incrementalReview": true },
  "language": { "user": "pt-BR", "code": "en", "productStrings": "pt-BR" },
  "complexity": { "warn": 10, "error": 15 },
  "registry": { "versioned": true }
}
```

The preset only *fills* the interview's defaults — the written profile is always fully explicit, so any knob can later be changed by editing the JSON or re-running this skill. `tdd.mode` and the commit gate accept `strict` (block), `advisory` (warn, allow), `off`.

Matrix cells accept a model name or `{"model": ..., "effort": "low|medium|high"}` — effort is often a bigger saving than a tier swap for mechanical roles. `prices` (optional) overrides the CLI's built-in per-Mtok price table used by `task-cli report` for cost estimation; `null` keeps the defaults.

`notes` per area is free text injected into tester/dev prompts — use it for short stack conventions ("CommonJS only", "TailwindCSS only").

`skills` per area is the **extension point**: names of project or user skills (`.claude/skills/<name>/` or `~/.claude/skills/<name>/`) that pipeline agents must load before working — the place for code-rules skills, security checklists, domain conventions. During detection (step 1), list the project's existing skills and offer to link the relevant ones to each area. This keeps the boundary clean: the plugin carries the process, the project carries the conventions, and the profile says where to find them.
