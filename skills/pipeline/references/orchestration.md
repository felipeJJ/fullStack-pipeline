# Agent Orchestration Mechanics

Current Claude Code mechanics (2026): there is no `TeamCreate`/`TeamDelete` and no `team_name` parameter — the session has a single implicit team. Do not attempt those calls; they belong to a removed experimental API.

## Spawning

- **Level 1-2:** `Agent` tool without a name. Fire, collect the result, move on. Cheapest path.
- **Level 3+:** `Agent` tool **with `name`** (e.g. `tester-backend`, `dev-frontend`). Named agents stay addressable via `SendMessage` after spawning — use this for iteration (review feedback → dev fixes → re-review) instead of respawning with re-explained context.
- Spawn all independent agents **in a single message** (multiple tool calls) so they run concurrently.

## Parallelism rules

Default is parallel. Sequence only when:
- one agent's output is another's input (dev-frontend needs an endpoint dev-backend hasn't delivered);
- two agents would edit the same file;
- a phase depends on a validated previous phase (level 5).

## Communication

- `SendMessage({to: "<name>", message})` to instruct a named agent; their replies arrive automatically.
- Agents report completion via message. The orchestrator verifies directly (read files, run tests) before accepting — completion claims are not evidence.
- When an agent's deliverable is validated, release it (send a shutdown request). Never keep idle agents alive "for later" — spawn fresh ones for later phases.

## When a Workflow script beats a team

Use the `Workflow` tool (deterministic JS orchestration) instead of named agents when the shape is a **mechanical fan-out with no dialogue**: one tester per area writing independent specs, parallel review of N files, adversarial verification of findings. Use named agents when the shape is **iterative dialogue**: dev ↔ reviewer rework loops, phased implementation with decisions between phases. Mixing is fine — a workflow for the fan-out phase, named agents for the rework loop.

## Visibility

Agent activity is visible in the session's task/agent UI. If the user wants richer live visibility (e.g. terminal panes), that is a display concern — configure it at the harness level; do not change orchestration mechanics for it.
