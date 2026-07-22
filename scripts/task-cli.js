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
const PROFILE_FILE = path.join(DIR, 'profile.json');
const PLANS_DIR = path.join(DIR, 'plans');
const INDEX_FILE = path.join(DIR, 'INDEX.md');

// API prices per Mtok (cached 2026-07; override via profile.json "prices").
const DEFAULT_PRICES = {
  fable: { input: 10, output: 50 },
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
};

function loadProfile() {
  try {
    return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function levelBand(level) {
  return level <= 2 ? '1-2' : level <= 4 ? '3-4' : '5';
}

// Snapshot of the model matrix cells that apply to this task's level band.
// Cells may be a string ("sonnet") or an object ({model, effort}).
function matrixSnapshot(profile, level) {
  if (!profile || !profile.models) return null;
  const band = levelBand(level);
  const snapshot = {};
  for (const [role, bands] of Object.entries(profile.models)) {
    if (bands && bands[band] !== undefined) snapshot[role] = bands[band];
  }
  return Object.keys(snapshot).length ? snapshot : null;
}

function matrixSignature(models) {
  if (!models) return 'session-model';
  return Object.entries(models)
    .map(([role, cell]) => {
      const model = typeof cell === 'string' ? cell : cell.model || 'inherit';
      const effort = typeof cell === 'object' && cell.effort ? `/${cell.effort}` : '';
      return `${role[0]}:${model}${effort}`;
    })
    .sort()
    .join(' ');
}

function taskCost(task, prices) {
  if (!task.usage || !task.usage.length) return null;
  let total = 0;
  for (const u of task.usage) {
    const p = prices[u.model];
    if (!p) continue;
    total +=
      ((u.input || 0) / 1e6) * p.input +
      ((u.output || 0) / 1e6) * p.output +
      ((u.cacheRead || 0) / 1e6) * p.input * 0.1;
  }
  return total;
}

function wallMinutes(task) {
  if (!task.startedAt || !task.doneAt) return null;
  return (new Date(task.doneAt) - new Date(task.startedAt)) / 60000;
}

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
      models: null,
      events: [],
      usage: [],
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
    task.models = task.models || matrixSnapshot(loadProfile(), task.level);
    save(tasks);
    console.log(`TASK-${task.id} in progress.`);
    if (task.models) console.log(`models: ${matrixSignature(task.models)}`);
  },

  rework(args) {
    const { flags, rest } = parseFlags(args);
    const tasks = load();
    const task = find(tasks, rest[0]);
    task.attempts = (task.attempts || 0) + 1;
    task.events = task.events || [];
    task.events.push({
      at: new Date().toISOString(),
      type: 'rework',
      area: flags.area || null,
      reason: flags.reason || null,
    });
    save(tasks);
    console.log(`TASK-${task.id}: rework recorded (attempt ${task.attempts}).`);
  },

  usage(args) {
    const { flags, rest } = parseFlags(args);
    const tasks = load();
    const task = find(tasks, rest[0]);
    if (!flags.json) {
      fail('usage: usage <id> --json=\'[{"model":"sonnet","input":300000,"output":20000,"cacheRead":0}]\'');
    }
    let entries;
    try {
      entries = JSON.parse(flags.json);
    } catch (e) {
      fail(`invalid JSON: ${e.message}`);
    }
    task.usage = (task.usage || []).concat(entries);
    save(tasks);
    const prices = { ...DEFAULT_PRICES, ...((loadProfile() || {}).prices || {}) };
    const cost = taskCost(task, prices);
    console.log(
      `TASK-${task.id}: usage recorded (${task.usage.length} entries` +
      `${cost !== null ? `, est. cost $${cost.toFixed(2)}` : ''}).`
    );
  },

  report(args) {
    const { flags } = parseFlags(args);
    const prices = { ...DEFAULT_PRICES, ...((loadProfile() || {}).prices || {}) };
    const done = load().filter(
      (t) => t.status === 'done' && (!flags.since || t.doneAt >= flags.since)
    );
    if (!done.length) return console.log('no completed tasks to report.');

    console.log('ID\tLevel\tWall(min)\tAttempts\tCost($)\tMatrix');
    for (const t of [...done].sort((a, b) => a.id - b.id)) {
      const wall = wallMinutes(t);
      const cost = taskCost(t, prices);
      console.log(
        `TASK-${t.id}\tL${t.level}\t${wall !== null ? wall.toFixed(1) : '-'}\t` +
        `${t.attempts || 0}\t${cost !== null ? cost.toFixed(2) : '-'}\t${matrixSignature(t.models)}`
      );
    }

    // Aggregate per matrix signature — this is the A/B comparison view.
    const groups = new Map();
    for (const t of done) {
      const sig = matrixSignature(t.models);
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(t);
    }
    console.log('\nBy matrix (A/B view):');
    console.log('Matrix\tTasks\tAvgWall(min)\tAvgAttempts\tAvgCost($)');
    for (const [sig, group] of groups) {
      const avg = (vals) => {
        const known = vals.filter((v) => v !== null);
        return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
      };
      const avgWall = avg(group.map(wallMinutes));
      const avgAttempts = group.reduce((a, t) => a + (t.attempts || 0), 0) / group.length;
      const avgCost = avg(group.map((t) => taskCost(t, prices)));
      console.log(
        `${sig}\t${group.length}\t${avgWall !== null ? avgWall.toFixed(1) : '-'}\t` +
        `${avgAttempts.toFixed(1)}\t${avgCost !== null ? avgCost.toFixed(2) : '-'}`
      );
    }
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
