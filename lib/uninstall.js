import fs from "node:fs";
import path from "node:path";

const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/mentor-guard.mjs"';
const BEGIN = "<!-- mentor-mode:begin -->";
const END = "<!-- mentor-mode:end -->";

export class UninstallError extends Error {}

export function uninstall(target, { purge = false } = {}, packRoot) {
  const removed = [];
  const kept = [];
  const notes = [];

  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new UninstallError("Target does not exist or is not a directory: " + target);
  }
  if (packRoot && fs.realpathSync(target) === fs.realpathSync(packRoot)) {
    throw new UninstallError("Refusing to uninstall from the pack repo itself: " + target);
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

  function sideNames(source, key) {
    return (source && Array.isArray(source[key]) ? source[key] : []).filter(safeName);
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
    // Old flat manifests ({skills, agents, hook}) are claude-only; codex side is skipped.
    const claudeSide = manifest.claude && typeof manifest.claude === "object" ? manifest.claude : manifest;
    const codexSide = manifest.codex && typeof manifest.codex === "object" ? manifest.codex : null;

    for (const name of sideNames(claudeSide, "skills")) {
      removeIfPresent(path.join(target, ".claude", "skills", name), "skill .claude/skills/" + name);
    }
    for (const name of sideNames(claudeSide, "agents")) {
      removeIfPresent(path.join(target, ".claude", "agents", name), "agent .claude/agents/" + name);
    }
    removeIfPresent(path.join(target, ".claude", "hooks", "mentor-guard.mjs"), "hook .claude/hooks/mentor-guard.mjs");

    if (codexSide) {
      for (const name of sideNames(codexSide, "skills")) {
        removeIfPresent(path.join(target, ".agents", "skills", name), "skill .agents/skills/" + name);
      }
      for (const name of sideNames(codexSide, "agents")) {
        removeIfPresent(path.join(target, ".agents", "agents", name), "agent .agents/agents/" + name);
      }
    }

    removeIfPresent(manifestPath, ".claude/mentor-manifest.json");
    rmdirIfEmpty(path.join(target, ".claude", "skills"), ".claude/skills");
    rmdirIfEmpty(path.join(target, ".claude", "agents"), ".claude/agents");
    rmdirIfEmpty(path.join(target, ".claude", "hooks"), ".claude/hooks");
    if (codexSide) {
      rmdirIfEmpty(path.join(target, ".agents", "skills"), ".agents/skills");
      rmdirIfEmpty(path.join(target, ".agents", "agents"), ".agents/agents");
      rmdirIfEmpty(path.join(target, ".agents"), ".agents");
    }
  } else {
    // Without a manifest there is no record of pack ownership, so nothing is deleted.
    notes.push("No readable .claude/mentor-manifest.json found, skipping skill, agent, and hook removal.");
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

  function removeBlock(filePath, label) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    const begin = content.indexOf(BEGIN);
    const end = content.indexOf(END);
    if (begin === -1 || end === -1 || end < begin) return;
    let endIdx = end + END.length;
    if (content[endIdx] === "\n") endIdx += 1;
    let remainder = content.slice(0, begin) + content.slice(endIdx);
    if (remainder.trim() === "") {
      fs.rmSync(filePath);
      removed.push(label + " (contained only the mentor-mode block)");
    } else {
      remainder = remainder.replace(/\n+$/, "\n");
      fs.writeFileSync(filePath, remainder);
      removed.push("mentor-mode block from " + label);
    }
  }

  removeBlock(path.join(target, "CLAUDE.md"), "CLAUDE.md");
  removeBlock(path.join(target, "AGENTS.md"), "AGENTS.md");

  // Installer-made editor and gitignore edits are undone only when the manifest
  // says the installer made them, and only if they still hold the installed value.
  const opts = manifest && typeof manifest === "object" && manifest.options && typeof manifest.options === "object"
    ? manifest.options
    : {};

  if (opts.vscode) {
    const vscodePath = path.join(target, ".vscode", "settings.json");
    if (fs.existsSync(vscodePath)) {
      try {
        const vs = JSON.parse(fs.readFileSync(vscodePath, "utf8"));
        if (vs && typeof vs === "object" && !Array.isArray(vs) && vs["editor.inlineSuggest.enabled"] === false) {
          delete vs["editor.inlineSuggest.enabled"];
          if (Object.keys(vs).length === 0) {
            fs.rmSync(vscodePath);
            removed.push(".vscode/settings.json (contained only the mentor-mode setting)");
            rmdirIfEmpty(path.join(target, ".vscode"), ".vscode");
          } else {
            fs.writeFileSync(vscodePath, JSON.stringify(vs, null, 2) + "\n");
            removed.push("inline-suggestions setting from .vscode/settings.json");
          }
        }
      } catch {
        kept.push(".vscode/settings.json (not valid JSON, left untouched)");
      }
    }
  }

  if (opts.gitignore) {
    const giPath = path.join(target, ".gitignore");
    if (fs.existsSync(giPath)) {
      const content = fs.readFileSync(giPath, "utf8");
      const lines = content.split("\n");
      const filtered = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === "# mentor-mode" && i + 1 < lines.length && lines[i + 1].trim() === "scratch/") {
          i += 1;
          continue;
        }
        filtered.push(lines[i]);
      }
      if (filtered.length !== lines.length) {
        const remainder = filtered.join("\n");
        if (remainder.trim() === "") {
          fs.rmSync(giPath);
          removed.push(".gitignore (contained only the mentor-mode entries)");
        } else {
          fs.writeFileSync(giPath, remainder);
          removed.push("mentor-mode entries from .gitignore");
        }
      }
    }
  }

  const mentorDir = path.join(target, "mentor");
  if (purge) {
    removeIfPresent(mentorDir, "mentor/ (purged)");
  } else if (fs.existsSync(mentorDir)) {
    kept.push("mentor/ (learner state, use --purge to delete)");
  }

  const scratchDir = path.join(target, "scratch");
  if (purge) {
    removeIfPresent(scratchDir, "scratch/ (purged)");
  } else if (fs.existsSync(scratchDir)) {
    kept.push("scratch/ (experiments, use --purge to delete)");
  }

  return { removed, kept, notes };
}
