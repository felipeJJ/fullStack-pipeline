#!/usr/bin/env node
/**
 * fullStack-pipeline task registry CLI.
 * Local-first: structured data in tasks.json, human-readable plans in plans/,
 * generated INDEX.md for fast scanning. Run from the project root.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIR = path.join(ROOT, '.claude', 'pipeline');
const TASKS_FILE = path.join(DIR, 'tasks.json');
const PLANS_DIR = path.join(DIR, 'plans');
const INDEX_FILE = path.join(DIR, 'INDEX.md');

function load() {
  if (!fs.existsSync(TASKS_FILE)) return [];
  return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
}

function save(tasks) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2) + '\n');
  writeIndex(tasks);
}

function planPath(id) {
  return path.join(PLANS_DIR, `TASK-${id}.md`);
}

function find(tasks, id) {
  const task = tasks.find((t) => String(t.id) === String(id).replace(/^TASK-/i, ''));
  if (!task) fail(`TASK-${id} not found.`);
  return task;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (const a of args) {
    const m = a.match(/^--([\w-]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
    else rest.push(a);
  }
  return { flags, rest };
}

function writeIndex(tasks) {
  const rows = [...tasks].sort((a, b) => b.id - a.id).map((t) => {
    const done = t.status === 'done' ? ` — ${(t.commit || '').slice(0, 7)}` : '';
    return `| TASK-${t.id} | ${t.title} | ${t.type} | ${t.level} | ${t.status}${done} | ${t.createdAt.slice(0, 10)} |`;
  });
  const body = [
    '# Task Index (generated — do not edit)',
    '',
    '| ID | Title | Type | Level | Status | Created |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(INDEX_FILE, body);
}

const PLAN_TEMPLATE = (task) => `# TASK-${task.id} — ${task.title}

**Type:** ${task.type} | **Level:** ${task.level} | **Created:** ${task.createdAt.slice(0, 10)}

## Discovery

<!-- Q&A with the user. Record answers immediately after receiving them. -->

## Plan

<!-- Mini-tasks. The orchestrator ticks these at conclusion, never the devs. -->

- [ ] ...

## Impact analysis

<!-- Existing tests covering the touched code, or "none: <reason>". -->

## Cross-area contract

<!-- Only when the task spans areas: exact field names, formats, endpoints. -->

## Decisions

<!-- User decisions made mid-task (incl. tests-as-spec behavior changes). -->
`;

const commands = {
  new(args) {
    const { flags, rest } = parseFlags(args);
    const title = rest.join(' ');
    if (!title) fail('usage: new "<title>" --type=improvement|bugfix --level=N');
    const tasks = load();
    const task = {
      id: tasks.reduce((m, t) => Math.max(m, t.id), 0) + 1,
      title,
      type: flags.type || 'improvement',
      level: Number(flags.level) || 2,
      status: 'planned',
      tdd: 'pending',
      createdAt: new Date().toISOString(),
      commit: null,
      attempts: 0,
      notes: [],
    };
    tasks.push(task);
    fs.mkdirSync(PLANS_DIR, { recursive: true });
    fs.writeFileSync(planPath(task.id), PLAN_TEMPLATE(task));
    save(tasks);
    console.log(`TASK-${task.id} created.\nplan: ${planPath(task.id)}`);
  },

  list(args) {
    const { flags } = parseFlags(args);
    const tasks = load().filter((t) => !flags.status || t.status === flags.status);
    if (!tasks.length) return console.log('no tasks.');
    for (const t of [...tasks].sort((a, b) => b.id - a.id)) {
      console.log(`TASK-${t.id}\t[${t.status}]\tL${t.level}\t${t.type}\t${t.title}`);
    }
  },

  search(args) {
    const term = args.join(' ').toLowerCase();
    if (!term) fail('usage: search "<term>"');
    const tasks = load();
    const hits = new Set();
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(term)) hits.add(t.id);
      const p = planPath(t.id);
      if (fs.existsSync(p) && fs.readFileSync(p, 'utf8').toLowerCase().includes(term)) hits.add(t.id);
    }
    if (!hits.size) return console.log('no matches.');
    for (const id of [...hits].sort((a, b) => b - a)) {
      const t = tasks.find((x) => x.id === id);
      console.log(`TASK-${t.id}\t[${t.status}]\t${t.title}\n\tplan: ${planPath(t.id)}`);
    }
  },

  show(args) {
    const task = find(load(), args[0]);
    console.log(JSON.stringify(task, null, 2));
    console.log(`plan: ${planPath(task.id)}`);
  },

  start(args) {
    const tasks = load();
    const active = tasks.find((t) => ['in-progress', 'ready'].includes(t.status));
    const task = find(tasks, args[0]);
    if (active && active.id !== task.id) {
      fail(`TASK-${active.id} is still ${active.status}. Close it (done) before starting another.`);
    }
    task.status = 'in-progress';
    task.startedAt = task.startedAt || new Date().toISOString();
    save(tasks);
    console.log(`TASK-${task.id} in progress.`);
  },

  'tdd-red'(args) {
    const tasks = load();
    const task = find(tasks, args[0]);
    task.tdd = 'red';
    save(tasks);
    console.log(`TASK-${task.id}: red tests confirmed — production edits unblocked.`);
  },

  'tdd-skip'(args) {
    const { flags, rest } = parseFlags(args);
    if (!flags.reason) fail('tdd-skip requires --reason="..." (it is recorded).');
    const tasks = load();
    const task = find(tasks, rest[0]);
    task.tdd = 'skipped';
    task.tddReason = flags.reason;
    save(tasks);
    console.log(`TASK-${task.id}: TDD skipped (recorded reason: ${flags.reason}).`);
  },

  ready(args) {
    const tasks = load();
    const task = find(tasks, args[0]);
    if (task.tdd === 'pending') fail('TDD state still pending — tdd-red or tdd-skip first.');
    task.status = 'ready';
    save(tasks);
    console.log(`TASK-${task.id} ready — commit gate open.`);
  },

  done(args) {
    const { flags, rest } = parseFlags(args);
    const tasks = load();
    const task = find(tasks, rest[0]);
    task.status = 'done';
    task.doneAt = new Date().toISOString();
    if (flags.commit) task.commit = String(flags.commit);
    save(tasks);
    console.log(`TASK-${task.id} done${task.commit ? ` (${task.commit.slice(0, 7)})` : ''}.`);
  },

  note(args) {
    const tasks = load();
    const task = find(tasks, args[0]);
    const text = args.slice(1).join(' ');
    if (!text) fail('usage: note <id> "<text>"');
    task.notes.push({ at: new Date().toISOString(), text });
    save(tasks);
    console.log(`noted on TASK-${task.id}.`);
  },

  index() {
    writeIndex(load());
    console.log(`wrote ${INDEX_FILE}`);
  },
};

const [cmd, ...args] = process.argv.slice(2);
if (!cmd || !commands[cmd]) {
  console.log(`usage: task-cli.js <command>\ncommands: ${Object.keys(commands).join(', ')}`);
  process.exit(cmd ? 1 : 0);
}
commands[cmd](args);
