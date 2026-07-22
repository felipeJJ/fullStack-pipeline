#!/usr/bin/env node
// PreToolUse guard on Write|Edit: while a pipeline task is active and its red
// tests are not yet confirmed, block edits to production source files.
const path = require('path');
const { readStdin, projectDir, loadPipeline, matchesAny, block } = require('./lib');

const input = readStdin();
if (!input) process.exit(0);

const dir = projectDir(input);
const pipeline = loadPipeline(dir);
if (!pipeline) process.exit(0); // project has not opted in

const active = pipeline.tasks.find((t) => t.status === 'in-progress');
if (!active || active.tdd !== 'pending') process.exit(0);

const filePath = input.tool_input && input.tool_input.file_path;
if (!filePath) process.exit(0);
const rel = path.relative(dir, path.resolve(dir, filePath)).replace(/\\/g, '/');

for (const [areaName, area] of Object.entries(pipeline.profile.areas || {})) {
  if (matchesAny(rel, area.tests)) process.exit(0); // test files are always allowed
  if (matchesAny(rel, area.src)) {
    block(
      `TDD guard: TASK-${active.id} is in progress but red tests are not confirmed yet ` +
      `(area: ${areaName}, file: ${rel}). Write the failing tests first, validate them, then run ` +
      `task-cli tdd-red ${active.id} (or tdd-skip with a recorded reason).`
    );
  }
}
process.exit(0);
