import fs from "node:fs";
import path from "node:path";

const MATCHER = "Edit|Write|MultiEdit|NotebookEdit|Bash";
const HOOK_COMMAND = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/mentor-guard.mjs"';
const BEGIN = "<!-- mentor-mode:begin -->";
const GITIGNORE_MARKER = "# mentor-mode";

export const DEFAULT_OPTIONS = { harness: "both", vscode: false, scratch: true, gitignore: true };

export class InstallError extends Error {}

// Reads the options a previous install recorded, so `update` can refresh pack
// files without re-asking anything. Null when this repo has no manifest.
export function readManifest(target) {
  const manifestPath = path.join(target, ".claude", "mentor-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function install(target, options, packRoot) {
  const actions = [];
  const skipped = [];
  const warnings = [];
  const warn = (msg) => warnings.push(msg);

  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new InstallError("Target does not exist or is not a directory: " + target);
  }
  if (fs.realpathSync(target) === fs.realpathSync(packRoot)) {
    throw new InstallError("Refusing to install the pack into its own repo: " + target);
  }

  const installClaude = options.harness !== "codex";
  const installCodex = options.harness !== "claude";

  // Settings are validated before any copying so a bad file cannot leave a half-installed repo.
  const settingsPath = path.join(target, ".claude", "settings.json");
  let settings = {};
  let settingsExisted = false;
  if (installClaude && fs.existsSync(settingsPath)) {
    settingsExisted = true;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch (err) {
      throw new InstallError(".claude/settings.json exists but is not valid JSON. Fix it and re-run. Parse error: " + err.message);
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new InstallError(".claude/settings.json must contain a JSON object. Fix it and re-run.");
    }
    if (raw.hooks !== undefined && (!raw.hooks || typeof raw.hooks !== "object" || Array.isArray(raw.hooks))) {
      throw new InstallError('.claude/settings.json has a non-object "hooks" field. Fix it and re-run.');
    }
    if (raw.hooks && raw.hooks.PreToolUse !== undefined && !Array.isArray(raw.hooks.PreToolUse)) {
      throw new InstallError('.claude/settings.json has a non-array "hooks.PreToolUse" field. Fix it and re-run.');
    }
    settings = raw;
  }

  // A prior manifest is the record of what the pack owns and may safely overwrite.
  // Old flat manifests ({skills, agents, hook}) are read as claude-only ownership.
  const manifestPath = path.join(target, ".claude", "mentor-manifest.json");
  const prior = { claude: { skills: new Set(), agents: new Set() }, codex: { skills: new Set(), agents: new Set() } };
  if (fs.existsSync(manifestPath)) {
    const parsed = readManifest(target);
    if (parsed) {
      const claudeSide = parsed.claude && typeof parsed.claude === "object" ? parsed.claude : parsed;
      const codexSide = parsed.codex && typeof parsed.codex === "object" ? parsed.codex : {};
      for (const [side, source] of [[prior.claude, claudeSide], [prior.codex, codexSide]]) {
        if (Array.isArray(source.skills)) for (const s of source.skills) if (typeof s === "string") side.skills.add(s);
        if (Array.isArray(source.agents)) for (const a of source.agents) if (typeof a === "string") side.agents.add(a);
      }
    } else {
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

  const claudeSkills = installClaude ? installSkills(".claude", prior.claude.skills) : [];
  const claudeAgents = installClaude ? installAgents(".claude", prior.claude.agents) : [];
  const codexSkills = installCodex ? installSkills(".agents", prior.codex.skills) : [];
  const codexAgents = installCodex ? installAgents(".agents", prior.codex.agents) : [];
  if (claudeSkills.length === 0 && codexSkills.length === 0) skipped.push("no skills installed from " + skillsSrc);
  if (claudeAgents.length === 0 && codexAgents.length === 0) skipped.push("no agents installed from " + agentsSrc);

  if (installClaude) {
    const hookDest = path.join(target, ".claude", "hooks", "mentor-guard.mjs");
    fs.mkdirSync(path.dirname(hookDest), { recursive: true });
    fs.copyFileSync(path.join(packRoot, "hooks", "mentor-guard.mjs"), hookDest);
    actions.push("installed hook .claude/hooks/mentor-guard.mjs");
  }

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

  if (installClaude) {
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
  }

  // Inline AI suggestions are keystroke-level and invisible to the hook, so the
  // only enforcement point is editor config. Merge the one key, never clobber.
  if (options.vscode) {
    const vscodePath = path.join(target, ".vscode", "settings.json");
    let vs = {};
    let vsExisted = false;
    let vsReadable = true;
    if (fs.existsSync(vscodePath)) {
      vsExisted = true;
      try {
        const raw = JSON.parse(fs.readFileSync(vscodePath, "utf8"));
        if (raw && typeof raw === "object" && !Array.isArray(raw)) vs = raw;
        else vsReadable = false;
      } catch {
        vsReadable = false;
      }
    }
    if (!vsReadable) {
      warn('WARNING: .vscode/settings.json exists but could not be parsed (comments?), left untouched. Add "editor.inlineSuggest.enabled": false yourself.');
    } else if (vs["editor.inlineSuggest.enabled"] === false) {
      skipped.push("inline suggestions already disabled in .vscode/settings.json");
    } else {
      vs["editor.inlineSuggest.enabled"] = false;
      fs.mkdirSync(path.dirname(vscodePath), { recursive: true });
      fs.writeFileSync(vscodePath, JSON.stringify(vs, null, 2) + "\n");
      actions.push((vsExisted ? "updated" : "created") + " .vscode/settings.json (inline AI suggestions off in this workspace)");
    }
  }

  if (options.scratch) {
    const scratchDir = path.join(target, "scratch");
    const scratchReadme = path.join(scratchDir, "README.md");
    fs.mkdirSync(scratchDir, { recursive: true });
    if (!fs.existsSync(scratchReadme)) {
      fs.writeFileSync(scratchReadme, [
        "# Scratch",
        "",
        "Lab bench for the Mentor Mode workflow. Unprotected by design: both the",
        "learner and the mentor may write experiment files here. Use it for",
        "predict-then-run experiments, API poking, and throwaway probes - never",
        "for real project code.",
        "",
      ].join("\n"));
      actions.push("created scratch/ lab directory");
    } else {
      skipped.push("kept existing scratch/");
    }
  }

  if (options.gitignore && options.scratch) {
    const giPath = path.join(target, ".gitignore");
    const existing = fs.existsSync(giPath) ? fs.readFileSync(giPath, "utf8") : "";
    const lines = existing.split("\n");
    if (lines.some((l) => l.trim() === "scratch/" || l.trim() === "scratch")) {
      skipped.push(".gitignore already ignores scratch/");
    } else {
      const sep = existing === "" ? "" : existing.endsWith("\n") ? "" : "\n";
      fs.writeFileSync(giPath, existing + sep + GITIGNORE_MARKER + "\nscratch/\n");
      actions.push((existing === "" ? "created" : "updated") + " .gitignore (scratch/)");
    }
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
  if (installClaude) appendBlock(path.join(target, "CLAUDE.md"), claudeBlock, "CLAUDE.md");
  if (installCodex) appendBlock(path.join(target, "AGENTS.md"), agentsBlock, "AGENTS.md");

  const manifest = {
    version: "0.1.0",
    options,
    claude: installClaude
      ? { skills: claudeSkills, agents: claudeAgents, hook: ".claude/hooks/mentor-guard.mjs" }
      : { skills: [], agents: [] },
    codex: installCodex ? { skills: codexSkills, agents: codexAgents } : { skills: [], agents: [] },
    installedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  actions.push("wrote .claude/mentor-manifest.json");

  return { actions, skipped, warnings, installClaude, installCodex };
}
