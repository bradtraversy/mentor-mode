import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/mentor-guard.mjs"';
const BEGIN = "<!-- mentor-mode:begin -->";
const END = "<!-- mentor-mode:end -->";

const removed = [];
const kept = [];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const args = process.argv.slice(2);
const purge = args.includes("--purge");
const targetArg = args.find((a) => a !== "--purge");
if (!targetArg) fail("Usage: node scripts/uninstall.mjs <target-repo-path> [--purge]");
const target = path.resolve(targetArg);
if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
  fail("Target does not exist or is not a directory: " + target);
}
if (fs.realpathSync(target) === fs.realpathSync(packRoot)) {
  fail("Refusing to uninstall from the pack repo itself: " + target);
}

function removeIfPresent(absPath, label) {
  if (fs.existsSync(absPath)) {
    fs.rmSync(absPath, { recursive: true, force: true });
    removed.push(label);
  }
}

function rmdirIfEmpty(absPath, label) {
  if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory() && fs.readdirSync(absPath).length === 0) {
    fs.rmdirSync(absPath);
    removed.push(label + " (empty)");
  }
}

// Names with separators could escape the target tree, so they are rejected.
function safeName(name) {
  return typeof name === "string" && name !== "" && name !== "." && name !== ".." &&
    !name.includes("/") && !name.includes("\\");
}

const manifestPath = path.join(target, ".claude", "mentor-manifest.json");
let manifest = null;
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    manifest = null;
  }
}

if (manifest && typeof manifest === "object") {
  const skills = (Array.isArray(manifest.skills) ? manifest.skills : []).filter(safeName);
  const agents = (Array.isArray(manifest.agents) ? manifest.agents : []).filter(safeName);
  for (const name of skills) {
    removeIfPresent(path.join(target, ".claude", "skills", name), "skill " + name);
  }
  for (const name of agents) {
    removeIfPresent(path.join(target, ".claude", "agents", name), "agent " + name);
  }
  removeIfPresent(path.join(target, ".claude", "hooks", "mentor-guard.mjs"), "hook .claude/hooks/mentor-guard.mjs");
  removeIfPresent(manifestPath, ".claude/mentor-manifest.json");
  rmdirIfEmpty(path.join(target, ".claude", "skills"), ".claude/skills");
  rmdirIfEmpty(path.join(target, ".claude", "agents"), ".claude/agents");
  rmdirIfEmpty(path.join(target, ".claude", "hooks"), ".claude/hooks");
} else {
  // Without a manifest there is no record of pack ownership, so nothing is deleted.
  console.log("No readable .claude/mentor-manifest.json found, skipping skill, agent, and hook removal.");
}

const settingsPath = path.join(target, ".claude", "settings.json");
if (fs.existsSync(settingsPath)) {
  let settings = null;
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch {
    kept.push(".claude/settings.json (not valid JSON, left untouched)");
  }
  if (settings && typeof settings === "object" && !Array.isArray(settings) &&
      settings.hooks && typeof settings.hooks === "object" &&
      Array.isArray(settings.hooks.PreToolUse)) {
    const keep = [];
    let removedOurs = false;
    for (const entry of settings.hooks.PreToolUse) {
      if (entry && entry.matcher === MATCHER && Array.isArray(entry.hooks)) {
        const before = entry.hooks.length;
        entry.hooks = entry.hooks.filter(
          (h) => !(h && h.type === "command" && h.command === HOOK_COMMAND)
        );
        if (entry.hooks.length !== before) {
          removedOurs = true;
          if (entry.hooks.length === 0) continue;
        }
      }
      keep.push(entry);
    }
    // Only rewrite when a mentor entry actually came out, and only prune structures we emptied.
    if (removedOurs) {
      settings.hooks.PreToolUse = keep;
      if (keep.length === 0) delete settings.hooks.PreToolUse;
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      removed.push("mentor guard entry from .claude/settings.json");
    }
  }
}

const claudePath = path.join(target, "CLAUDE.md");
if (fs.existsSync(claudePath)) {
  const content = fs.readFileSync(claudePath, "utf8");
  const begin = content.indexOf(BEGIN);
  const end = content.indexOf(END);
  if (begin !== -1 && end !== -1 && end >= begin) {
    let endIdx = end + END.length;
    if (content[endIdx] === "\n") endIdx += 1;
    let remainder = content.slice(0, begin) + content.slice(endIdx);
    if (remainder.trim() === "") {
      fs.rmSync(claudePath);
      removed.push("CLAUDE.md (contained only the mentor-mode block)");
    } else {
      remainder = remainder.replace(/\n+$/, "\n");
      fs.writeFileSync(claudePath, remainder);
      removed.push("mentor-mode block from CLAUDE.md");
    }
  }
}

const mentorDir = path.join(target, "mentor");
if (purge) {
  removeIfPresent(mentorDir, "mentor/ (purged)");
} else if (fs.existsSync(mentorDir)) {
  kept.push("mentor/ (learner state, use --purge to delete)");
}

console.log("Mentor Mode uninstalled from " + target);
if (removed.length === 0) console.log("  nothing to remove");
for (const r of removed) console.log("  - removed " + r);
for (const k of kept) console.log("  = kept " + k);
