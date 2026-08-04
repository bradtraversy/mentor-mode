import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/mentor-guard.mjs"';

const actions = [];
const skipped = [];
const warnings = [];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function warn(msg) {
  console.warn(msg);
  warnings.push(msg);
}

const targetArg = process.argv[2];
if (!targetArg) fail("Usage: node scripts/install.mjs <target-repo-path>");
const target = path.resolve(targetArg);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  fail("Target does not exist or is not a directory: " + target);
}
if (fs.realpathSync(target) === fs.realpathSync(packRoot)) {
  fail("Refusing to install the pack into its own repo: " + target);
}

// Settings are validated before any copying so a bad file cannot leave a half-installed repo.
const settingsPath = path.join(target, ".claude", "settings.json");
let settings = {};
let settingsExisted = false;
if (fs.existsSync(settingsPath)) {
  settingsExisted = true;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (err) {
    fail(".claude/settings.json exists but is not valid JSON. Fix it and re-run install. Parse error: " + err.message);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    fail(".claude/settings.json must contain a JSON object. Fix it and re-run install.");
  }
  if (raw.hooks !== undefined && (!raw.hooks || typeof raw.hooks !== "object" || Array.isArray(raw.hooks))) {
    fail('.claude/settings.json has a non-object "hooks" field. Fix it and re-run install.');
  }
  if (raw.hooks && raw.hooks.PreToolUse !== undefined && !Array.isArray(raw.hooks.PreToolUse)) {
    fail('.claude/settings.json has a non-array "hooks.PreToolUse" field. Fix it and re-run install.');
  }
  settings = raw;
}

// A prior manifest is the record of what the pack owns and may safely overwrite.
const manifestPath = path.join(target, ".claude", "mentor-manifest.json");
const priorSkills = new Set();
const priorAgents = new Set();
if (fs.existsSync(manifestPath)) {
  try {
    const prior = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (prior && typeof prior === "object") {
      if (Array.isArray(prior.skills)) for (const s of prior.skills) if (typeof s === "string") priorSkills.add(s);
      if (Array.isArray(prior.agents)) for (const a of prior.agents) if (typeof a === "string") priorAgents.add(a);
    }
  } catch {
    warn("WARNING: existing .claude/mentor-manifest.json is unreadable, treating everything already present as user-owned");
  }
}

const skillNames = [];
const skillsSrc = path.join(packRoot, "skills");
if (fs.existsSync(skillsSrc)) {
  for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dest = path.join(target, ".claude", "skills", entry.name);
    if (fs.existsSync(dest) && !priorSkills.has(entry.name)) {
      warn('WARNING: skipped skill "' + entry.name + '": .claude/skills/' + entry.name + " already exists and was not installed by mentor-mode");
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(skillsSrc, entry.name), dest, { recursive: true, force: true });
    skillNames.push(entry.name);
    actions.push("installed skill " + entry.name);
  }
}
if (skillNames.length === 0) skipped.push("no skills installed from " + skillsSrc);

const agentNames = [];
const agentsSrc = path.join(packRoot, "agents");
if (fs.existsSync(agentsSrc)) {
  for (const entry of fs.readdirSync(agentsSrc, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const dest = path.join(target, ".claude", "agents", entry.name);
    if (fs.existsSync(dest) && !priorAgents.has(entry.name)) {
      warn('WARNING: skipped agent "' + entry.name + '": .claude/agents/' + entry.name + " already exists and was not installed by mentor-mode");
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(agentsSrc, entry.name), dest);
    agentNames.push(entry.name);
    actions.push("installed agent " + entry.name);
  }
}
if (agentNames.length === 0) skipped.push("no agents installed from " + agentsSrc);

const hookDest = path.join(target, ".claude", "hooks", "mentor-guard.mjs");
fs.mkdirSync(path.dirname(hookDest), { recursive: true });
fs.copyFileSync(path.join(packRoot, "hooks", "mentor-guard.mjs"), hookDest);
actions.push("installed hook .claude/hooks/mentor-guard.mjs");

// Learner state under mentor/ is never overwritten, files copy only when absent.
function copyIfAbsent(srcDir, destDir, relBase) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    const rel = relBase + "/" + entry.name;
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyIfAbsent(src, dest, rel);
    } else if (fs.existsSync(dest)) {
      skipped.push("kept existing " + rel);
    } else {
      fs.copyFileSync(src, dest);
      actions.push("created " + rel);
    }
  }
}
const mentorSrc = path.join(packRoot, "templates", "mentor");
fs.mkdirSync(path.join(target, "mentor"), { recursive: true });
copyIfAbsent(mentorSrc, path.join(target, "mentor"), "mentor");

if (settings.hooks === undefined) settings.hooks = {};
if (settings.hooks.PreToolUse === undefined) settings.hooks.PreToolUse = [];
let entry = settings.hooks.PreToolUse.find((e) => e && e.matcher === MATCHER);
if (!entry) {
  entry = { matcher: MATCHER, hooks: [] };
  settings.hooks.PreToolUse.push(entry);
}
if (!Array.isArray(entry.hooks)) entry.hooks = [];
if (entry.hooks.some((h) => h && h.type === "command" && h.command === HOOK_COMMAND)) {
  // Already registered, skip the write so an unchanged file is not churned.
  skipped.push("PreToolUse hook already registered in .claude/settings.json");
} else {
  entry.hooks.push({ type: "command", command: HOOK_COMMAND });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  actions.push((settingsExisted ? "updated" : "created") + " .claude/settings.json with the PreToolUse hook");
}

const claudeBlock = fs.readFileSync(path.join(packRoot, "templates", "CLAUDE-block.md"), "utf8");
const claudePath = path.join(target, "CLAUDE.md");
if (fs.existsSync(claudePath)) {
  const existing = fs.readFileSync(claudePath, "utf8");
  if (existing.includes("<!-- mentor-mode:begin -->")) {
    skipped.push("CLAUDE.md already contains the mentor-mode block");
  } else {
    const sep = existing === "" ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(claudePath, existing + sep + claudeBlock);
    actions.push("appended mentor-mode block to CLAUDE.md");
  }
} else {
  fs.writeFileSync(claudePath, claudeBlock);
  actions.push("created CLAUDE.md with mentor-mode block");
}

const manifest = {
  version: "0.1.0",
  skills: skillNames,
  agents: agentNames,
  hook: ".claude/hooks/mentor-guard.mjs",
  installedAt: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
actions.push("wrote .claude/mentor-manifest.json");

console.log("Mentor Mode installed into " + target);
for (const a of actions) console.log("  + " + a);
for (const s of skipped) console.log("  - " + s);
for (const w of warnings) console.log("  ! " + w);
