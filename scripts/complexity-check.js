#!/usr/bin/env node
/**
 * Approximate cyclomatic complexity per function (decision points + 1) for
 * JS/JSX/TS/TSX. Self-contained on purpose: no dependency on the project's
 * linter version, and the same metric applies to baseline and current code,
 * which is all a ratchet needs.
 *
 * Usage:
 *   complexity-check.js <files...> [--baseline=<git-ref>]
 *   complexity-check.js --all            # scan every area's src globs
 *
 * Thresholds come from .claude/pipeline/profile.json (complexity.warn/error;
 * defaults 10/15). Exit 1 when a function exceeds the error threshold and is
 * new or more complex than at the baseline ref (the ratchet violation).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { matchesAny } = require('./hooks/lib');

const ROOT = process.cwd();
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

function loadThresholds() {
  try {
    const profile = JSON.parse(
      fs.readFileSync(path.join(ROOT, '.claude', 'pipeline', 'profile.json'), 'utf8')
    );
    return { warn: 10, error: 15, ...(profile.complexity || {}), profile };
  } catch {
    return { warn: 10, error: 15, profile: null };
  }
}

// Blank out comments and string/template contents, preserving newlines so
// line numbers stay correct.
function stripNoise(source) {
  let out = '';
  let i = 0;
  let mode = 'code'; // code | line | block | single | double | template
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') mode = 'line';
      else if (c === '/' && next === '*') mode = 'block';
      else if (c === "'") mode = 'single';
      else if (c === '"') mode = 'double';
      else if (c === '`') mode = 'template';
      out += mode === 'code' ? c : ' ';
    } else {
      if (mode === 'line' && c === '\n') mode = 'code';
      else if (mode === 'block' && c === '*' && next === '/') { mode = 'code'; out += '  '; i += 2; continue; }
      else if (mode === 'single' && c === "'" && source[i - 1] !== '\\') mode = 'code';
      else if (mode === 'double' && c === '"' && source[i - 1] !== '\\') mode = 'code';
      else if (mode === 'template' && c === '`' && source[i - 1] !== '\\') mode = 'code';
      out += c === '\n' ? '\n' : ' ';
    }
    i += 1;
  }
  return out;
}

const FN_PATTERNS = [
  /\bfunction\s*\*?\s*([A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{$/,
  /(?:^|[\s,(:=])([A-Za-z0-9_$]+)\s*(?::|=)\s*(?:async\s+)?(?:function\s*\*?\s*)?\([^)]*\)\s*(?:=>\s*)?\{$/,
  /(?:^|\s)(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{$/, // method shorthand
  /=>\s*\{$/, // anonymous arrow
];
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try']);

function analyze(source) {
  const clean = stripNoise(source);
  const lines = clean.split('\n');
  const stack = [];
  const results = [];
  let depth = 0;

  for (let ln = 0; ln < lines.length; ln += 1) {
    const line = lines[ln];
    // Function opening on this line? Check text up to each `{`.
    for (let ci = 0; ci < line.length; ci += 1) {
      const ch = line[ci];
      if (ch === '{') {
        const before = line.slice(0, ci + 1).trim().replace(/\{$/, '').trim() + '{';
        let name = null;
        for (const pattern of FN_PATTERNS) {
          const m = before.match(pattern);
          if (m) {
            const candidate = m[1] || '<anonymous>';
            if (!KEYWORDS.has(candidate)) { name = candidate; break; }
          }
        }
        depth += 1;
        if (name) stack.push({ name, line: ln + 1, complexity: 1, depth });
      } else if (ch === '}') {
        if (stack.length && stack[stack.length - 1].depth === depth) {
          results.push(stack.pop());
        }
        depth -= 1;
      }
    }
    // Decision points attributed to the innermost open function.
    if (stack.length) {
      const top = stack[stack.length - 1];
      const points =
        (line.match(/\b(?:if|for|while|case|catch)\b/g) || []).length +
        (line.match(/&&|\|\||\?\?/g) || []).length +
        (line.match(/\?(?![.?])/g) || []).length;
      top.complexity += points;
    }
  }
  return results.concat(stack); // unclosed functions (parse drift) still reported
}

function fileAtRef(ref, relPath) {
  try {
    return execSync(`git show ${ref}:"${relPath}"`, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  } catch {
    return null; // new file at this ref
  }
}

function collectAllFiles(profile) {
  const globs = Object.values((profile && profile.areas) || {}).flatMap((a) => a.src || []);
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (EXTENSIONS.includes(path.extname(entry.name))) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (matchesAny(rel, globs)) files.push(rel);
      }
    }
  })(ROOT);
  return files;
}

const argv = process.argv.slice(2);
const baselineArg = argv.find((a) => a.startsWith('--baseline'));
const baselineRef = baselineArg ? (baselineArg.split('=')[1] || 'HEAD') : null;
const { warn, error, profile } = loadThresholds();

const files = argv.includes('--all')
  ? collectAllFiles(profile)
  : argv.filter((a) => !a.startsWith('--')).filter((f) => EXTENSIONS.includes(path.extname(f)));

if (!files.length) {
  console.log('complexity: no JS/TS files to analyze.');
  process.exit(0);
}

let violations = 0;
let warnings = 0;
for (const file of files) {
  const rel = path.relative(ROOT, path.resolve(ROOT, file)).replace(/\\/g, '/');
  if (!fs.existsSync(rel)) continue;
  const current = analyze(fs.readFileSync(rel, 'utf8'));
  const baseline = baselineRef ? fileAtRef(baselineRef, rel) : null;
  const baselineByName = new Map(
    (baseline ? analyze(baseline) : []).map((f) => [f.name, f.complexity])
  );
  for (const fn of current.filter((f) => f.complexity >= warn).sort((a, b) => b.complexity - a.complexity)) {
    const base = baselineByName.get(fn.name);
    const delta = base !== undefined ? ` (baseline ${base})` : baselineRef ? ' (new)' : '';
    const ratchetViolation = fn.complexity > error && (base === undefined || fn.complexity > base);
    if (ratchetViolation) violations += 1; else warnings += 1;
    console.log(
      `${ratchetViolation ? 'ERROR' : 'warn '} ${rel}:${fn.line} ${fn.name} complexity ${fn.complexity}${delta}`
    );
  }
}
console.log(
  `complexity: ${files.length} file(s), thresholds warn=${warn} error=${error}` +
  `${baselineRef ? `, baseline=${baselineRef}` : ''} — ${violations} violation(s), ${warnings} warning(s).`
);
process.exit(violations ? 1 : 0);
