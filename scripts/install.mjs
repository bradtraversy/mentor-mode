import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/mentor-guard.mjs"';
const BEGIN = "<!-- mentor-mode:begin -->";

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
// Old flat manifests ({skills, agents, hook}) are read as claude-only ownership.
const manifestPath = path.join(target, ".claude", "mentor-manifest.json");
const prior = { claude: { skills: new Set(), agents: new Set() }, codex: { skills: new Set(), agents: new Set() } };
if (fs.existsSync(manifestPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (parsed && typeof parsed === "object") {
      const claudeSide = parsed.claude && typeof parsed.claude === "object" ? parsed.claude : parsed;
      const codexSide = parsed.codex && typeof parsed.codex === "object" ? parsed.codex : {};
      for (const [side, source] of [[prior.claude, claudeSide], [prior.codex, codexSide]]) {
        if (Array.isArray(source.skills)) for (const s of source.skills) if (typeof s === "string") side.skills.add(s);
        if (Array.isArray(source.agents)) for (const a of source.agents) if (typeof a === "string") side.agents.add(a);
      }
    }
  } catch {
    warn("WARNING: existing .claude/mentor-manifest.json is unreadable, treating everything already present as user-owned");
  }
}

const skillsSrc = path.join(packRoot, "skills");
function installSkills(adapterDir, priorOwned) {
  const names = [];
  if (!fs.existsSync(skillsSrc)) return names;
  for (const entry of fs.readdirSync(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relDest = adapterDir + "/skills/" + entry.name;
    const dest = path.join(target, adapterDir, "skills", entry.name);
    if (fs.existsSync(dest) && !priorOwned.has(entry.name)) {
      warn('WARNING: skipped skill "' + entry.name + '": ' + relDest + " already exists and was not installed by mentor-mode");
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(path.join(skillsSrc, entry.name), dest, { recursive: true, force: true });
    names.push(entry.name);
    actions.push("installed skill " + relDest);
  }
  return names;
}

const agentsSrc = path.join(packRoot, "agents");
function installAgents(adapterDir, priorOwned) {
  const names = [];
  if (!fs.existsSync(agentsSrc)) return names;
  for (const entry of fs.readdirSync(agentsSrc, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const relDest = adapterDir + "/agents/" + entry.name;
    const dest = path.join(target, adapterDir, "agents", entry.name);
    if (fs.existsSync(dest) && !priorOwned.has(entry.name)) {
      warn('WARNING: skipped agent "' + entry.name + '": ' + relDest + " already exists and was not installed by mentor-mode");
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(agentsSrc, entry.name), dest);
    names.push(entry.name);
    actions.push("installed agent " + relDest);
  }
  return names;
}

const claudeSkills = installSkills(".claude", prior.claude.skills);
const claudeAgents = installAgents(".claude", prior.claude.agents);
const codexSkills = installSkills(".agents", prior.codex.skills);
const codexAgents = installAgents(".agents", prior.codex.agents);
if (claudeSkills.length === 0 && codexSkills.length === 0) skipped.push("no skills installed from " + skillsSrc);
if (claudeAgents.length === 0 && codexAgents.length === 0) skipped.push("no agents installed from " + agentsSrc);

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

function appendBlock(filePath, blockText, label) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    if (existing.includes(BEGIN)) {
      skipped.push(label + " already contains the mentor-mode block");
      return;
    }
    const sep = existing === "" ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(filePath, existing + sep + blockText);
    actions.push("appended mentor-mode block to " + label);
  } else {
    fs.writeFileSync(filePath, blockText);
    actions.push("created " + label + " with mentor-mode block");
  }
}

const claudeBlock = fs.readFileSync(path.join(packRoot, "templates", "CLAUDE-block.md"), "utf8");
const agentsBlockPath = path.join(packRoot, "templates", "AGENTS-block.md");
const agentsBlock = fs.existsSync(agentsBlockPath) ? fs.readFileSync(agentsBlockPath, "utf8") : claudeBlock;
appendBlock(path.join(target, "CLAUDE.md"), claudeBlock, "CLAUDE.md");
appendBlock(path.join(target, "AGENTS.md"), agentsBlock, "AGENTS.md");

const manifest = {
  version: "0.1.0",
  claude: { skills: claudeSkills, agents: claudeAgents, hook: ".claude/hooks/mentor-guard.mjs" },
  codex: { skills: codexSkills, agents: codexAgents },
  installedAt: new Date().toISOString(),
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
actions.push("wrote .claude/mentor-manifest.json");

console.log("Mentor Mode installed into " + target);
for (const a of actions) console.log("  + " + a);
for (const s of skipped) console.log("  - " + s);
for (const w of warnings) console.log("  ! " + w);
