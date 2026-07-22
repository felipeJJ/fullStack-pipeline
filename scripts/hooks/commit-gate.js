#!/usr/bin/env node
// PreToolUse guard on Bash: `git commit` requires a registered task in "ready"
// state. This makes unregistered hotfixes structurally rare instead of a
// discipline problem. Escape hatch: PIPELINE_SKIP_GATE=1 (register retroactively).
const { readStdin, projectDir, loadPipeline, block } = require('./lib');

const input = readStdin();
if (!input) process.exit(0);

const command = (input.tool_input && input.tool_input.command) || '';
if (!/\bgit\b[^\n|;&]*\bcommit\b/.test(command)) process.exit(0);
if (process.env.PIPELINE_SKIP_GATE === '1' || /PIPELINE_SKIP_GATE=1/.test(command)) process.exit(0);

const pipeline = loadPipeline(projectDir(input));
if (!pipeline) process.exit(0); // project has not opted in

const ready = pipeline.tasks.find((t) => t.status === 'ready');
if (ready) process.exit(0);

const active = pipeline.tasks.find((t) => t.status === 'in-progress');
if (active) {
  block(
    `Commit gate: TASK-${active.id} is in progress but not marked ready. Complete the conclusion ` +
    `checklist (tick plan checkboxes, present summary, get approval) then run task-cli ready ${active.id}.`
  );
}
block(
  'Commit gate: no registered pipeline task is ready. Register the work first ' +
  '(task-cli new "<title>" --type=bugfix ... ; task-cli start/ready) or, for a genuinely ' +
  'exceptional commit, prefix with PIPELINE_SKIP_GATE=1 and register it retroactively.'
);
