// Shared helpers for pipeline hooks. Hooks must NEVER break the session:
// on any unexpected condition they allow the action (exit 0).
const fs = require('fs');
const path = require('path');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function projectDir(input) {
  return (input && input.cwd) || process.cwd();
}

function loadPipeline(dir) {
  const base = path.join(dir, '.claude', 'pipeline');
  const profilePath = path.join(base, 'profile.json');
  const tasksPath = path.join(base, 'tasks.json');
  if (!fs.existsSync(profilePath)) return null;
  try {
    return {
      profile: JSON.parse(fs.readFileSync(profilePath, 'utf8')),
      tasks: fs.existsSync(tasksPath) ? JSON.parse(fs.readFileSync(tasksPath, 'utf8')) : [],
    };
  } catch {
    return null;
  }
}

// Minimal glob matcher: supports **, * and literal path segments.
function globToRegex(glob) {
  // Single pass so replacement output is never rescanned (** would otherwise
  // become .* and then have its * mangled by the * rule).
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\/|\*\*|\*/g, (m) => (m === '**/' ? '(?:.*/)?' : m === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${escaped}$`);
}

function matchesAny(relPath, globs) {
  return (globs || []).some((g) => globToRegex(g).test(relPath));
}

function block(message) {
  console.error(message);
  process.exit(2);
}

module.exports = { readStdin, projectDir, loadPipeline, matchesAny, block };
