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

const convention = pipeline.profile.commit || {};
const gateMode = convention.mode || 'strict'; // strict | advisory | off
if (gateMode === 'off') process.exit(0);
const deny = (message) => {
  if (gateMode === 'advisory') {
    console.error(`[advisory] ${message}`);
    process.exit(0);
  }
  block(message);
};

const ready = pipeline.tasks.find((t) => t.status === 'ready');
if (!ready) {
  const active = pipeline.tasks.find((t) => t.status === 'in-progress');
  if (active) {
    deny(
      `Commit gate: TASK-${active.id} is in progress but not marked ready. Complete the conclusion ` +
      `checklist (tick plan checkboxes, present summary, get approval) then run task-cli ready ${active.id}.`
    );
  } else {
    deny(
      'Commit gate: no registered pipeline task is ready. Register the work first ' +
      '(task-cli new "<title>" --type=bugfix ... ; task-cli start/ready) or, for a genuinely ' +
      'exceptional commit, prefix with PIPELINE_SKIP_GATE=1 and register it retroactively.'
    );
  }
  process.exit(0); // advisory mode fell through the deny
}

// Message convention (only checkable for inline -m messages).
const msgMatch = command.match(/-m\s+(?:"([^"]*)"|'([^']*)')/);
const message = msgMatch && (msgMatch[1] || msgMatch[2]);
if (message) {
  if (convention.format === 'conventional' &&
      !/^(feat|fix|chore|refactor|test|docs|perf|ci|style|build)(\([^)]+\))?!?: .+/.test(message)) {
    deny(
      `Commit gate: message does not follow conventional commits ("type(scope): subject"). Got: "${message}"`
    );
  }
  if (convention.requireTaskRef && !/TASK-\d+/i.test(message)) {
    deny(
      `Commit gate: message must reference the task id (TASK-${ready.id}). Got: "${message}"`
    );
  }
}
process.exit(0);
