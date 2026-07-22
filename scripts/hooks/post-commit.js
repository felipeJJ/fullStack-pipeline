#!/usr/bin/env node
// PostToolUse on Bash: after a successful `git commit`, close the "ready" task
// with the new commit hash automatically (no forgotten step-7).
const { execSync } = require('child_process');
const path = require('path');
const { readStdin, projectDir, loadPipeline } = require('./lib');

const input = readStdin();
if (!input) process.exit(0);

const command = (input.tool_input && input.tool_input.command) || '';
if (!/\bgit\b[^\n|;&]*\bcommit\b/.test(command)) process.exit(0);

const dir = projectDir(input);
const pipeline = loadPipeline(dir);
if (!pipeline) process.exit(0);

const ready = pipeline.tasks.find((t) => t.status === 'ready');
if (!ready) process.exit(0);

try {
  // Only close the task if HEAD was created just now (i.e. the commit succeeded).
  const headAge = Date.now() / 1000 - Number(execSync('git log -1 --format=%ct', { cwd: dir }).toString().trim());
  if (headAge > 60) process.exit(0);
  const hash = execSync('git rev-parse HEAD', { cwd: dir }).toString().trim();
  const cli = path.join(__dirname, '..', 'task-cli.js');
  execSync(`node "${cli}" done ${ready.id} --commit=${hash}`, { cwd: dir });
  console.log(`pipeline: TASK-${ready.id} closed with commit ${hash.slice(0, 7)}.`);
} catch {
  process.exit(0); // never break the session over bookkeeping
}
