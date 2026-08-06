// .mjs, not .js: this runs inside target repos that may declare "type": "commonjs".
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const WRITE_COMMANDS = new Set(["tee", "mv", "cp", "rm", "truncate", "dd", "patch", "ln", "install"]);
// Reveals expire so a stale flag cannot leave paths unprotected in later sessions.
const REVEAL_WINDOW_MS = 2 * 60 * 60 * 1000;

function globToRegExp(pattern) {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (ch === "?") {
      out += "[^/]";
      i += 1;
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp("^" + out + "$");
}

function matchesProtected(relPath, patterns) {
  const base = relPath.split("/").pop();
  for (const raw of patterns) {
    let pattern = raw.replace(/\\/g, "/").replace(/^\.\//, "");
    const isDirPattern = pattern.endsWith("/");
    pattern = pattern.replace(/\/+$/, "");
    if (pattern === "") continue;
    if (!/[*?]/.test(pattern)) {
      // Literal patterns protect the exact path and everything under it.
      if (relPath === pattern || relPath.startsWith(pattern + "/")) return true;
      if (!pattern.includes("/") && base === pattern) return true;
      continue;
    }
    const re = globToRegExp(pattern);
    if (re.test(relPath)) return true;
    if (isDirPattern && globToRegExp(pattern + "/**").test(relPath)) return true;
    // Slashless patterns like *.secret also match by basename anywhere in the tree.
    if (!pattern.includes("/") && re.test(base)) return true;
  }
  return false;
}

function toRepoRelative(target, root) {
  const resolved = path.resolve(root, target.replace(/\\/g, "/"));
  const rel = path.relative(root, resolved);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join("/");
}

function bashWriteTargets(command) {
  const stripped = command
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'[^']*'/g, " ");
  const targets = [];
  for (const segment of stripped.split(/&&|\|\||;|\|/)) {
    for (const m of segment.matchAll(/(?:\d?>>?|&>)\s*([^\s;|&]+)/g)) {
      targets.push(m[1]);
    }
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const cmd = tokens[0].replace(/\\/g, "/").split("/").pop();
    const inPlaceSed = cmd === "sed" && tokens.some((t) => /^-i/.test(t));
    if (!WRITE_COMMANDS.has(cmd) && !inPlaceSed) continue;
    for (const tok of tokens.slice(1)) {
      if (tok.startsWith("-") || /[<>]/.test(tok)) continue;
      targets.push(tok);
    }
  }
  return targets;
}

function isRevealValid(reveal, objectiveId) {
  if (reveal.active !== true || reveal.objectiveId !== objectiveId) return false;
  if (typeof reveal.grantedAt !== "string") return false;
  const granted = Date.parse(reveal.grantedAt);
  if (Number.isNaN(granted)) return false;
  const age = Date.now() - granted;
  return age >= 0 && age <= REVEAL_WINDOW_MS;
}

function teachingMessage(objective, relPath, viaShell) {
  const title = objective.title || objective.id;
  let msg =
    "Mentor Mode: blocked a write to " + relPath + ". " +
    'Objective "' + title + '" (' + objective.id + ") protects this path. " +
    "The learner writes this code, not the AI. " +
    "Guide with the hint ladder instead: a nudge first, then the concept, then pseudocode. " +
    "A full solution may only be provided after the learner explicitly asks for it via /reveal.";
  if (viaShell) {
    msg += " Shell writes to protected paths are blocked as well.";
  }
  return msg;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

async function main() {
  const stdinText = await readStdin();
  let payload = null;
  let payloadError = null;
  try {
    payload = JSON.parse(stdinText);
  } catch (err) {
    payloadError = err;
  }

  const envRoot = process.env.CLAUDE_PROJECT_DIR;
  const payloadCwd = payload && typeof payload.cwd === "string" && payload.cwd !== "" ? payload.cwd : null;
  const root =
    typeof envRoot === "string" && envRoot !== "" ? path.resolve(envRoot)
    : payloadCwd ? path.resolve(payloadCwd)
    : process.cwd();

  const guardPath = path.join(root, "mentor", "guard.json");
  // No guard file means the repo is not in mentor mode, so fail open.
  if (!fs.existsSync(guardPath)) process.exit(0);

  try {
    if (payloadError) throw payloadError;

    let guard;
    try {
      guard = JSON.parse(fs.readFileSync(guardPath, "utf8"));
    } catch {
      block("Mentor guard config at mentor/guard.json is unreadable and protection fails closed. Fix or restore the file before editing.");
    }

    const objective = guard && typeof guard === "object" ? guard.activeObjective : null;
    const reveal = guard && typeof guard === "object" ? guard.reveal : null;
    const shapeOk =
      guard && typeof guard === "object" && !Array.isArray(guard) &&
      typeof guard.mode === "string" &&
      objective && typeof objective === "object" && Array.isArray(objective.protectedPaths) &&
      reveal && typeof reveal === "object";
    if (!shapeOk) {
      block("Mentor guard config at mentor/guard.json is malformed and protection fails closed. Fix or restore the file before editing.");
    }

    if (guard.mode !== "on") process.exit(0);

    const patterns = objective.protectedPaths.filter((p) => typeof p === "string" && p.trim() !== "");
    if (patterns.length === 0 || objective.id === null || objective.id === undefined) process.exit(0);

    const unsupported = patterns.find((p) => /[{}\[\]]/.test(p));
    const revealValid = isRevealValid(reveal, objective.id);
    const toolName = payload.tool_name;
    const toolInput = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};

    if (WRITE_TOOLS.has(toolName) || toolName === "Bash") {
      if (unsupported !== undefined) {
        block('Mentor guard: protectedPaths pattern "' + unsupported + '" uses unsupported glob syntax (supported: * ** ? and literals) and must be rewritten. Protection fails closed.');
      }
    }

    if (WRITE_TOOLS.has(toolName)) {
      const target = toolInput.file_path || toolInput.notebook_path;
      if (typeof target !== "string" || target === "") process.exit(0);
      const rel = toRepoRelative(target, root);
      if (!rel) process.exit(0);
      if (matchesProtected(rel, patterns) && !revealValid) {
        block(teachingMessage(objective, rel, false));
      }
      process.exit(0);
    }

    if (toolName === "Bash") {
      const command = toolInput.command;
      if (typeof command !== "string" || command === "") process.exit(0);
      if (revealValid) process.exit(0);
      for (const raw of bashWriteTargets(command)) {
        const tok = raw.replace(/\\/g, "/");
        const candidates = new Set([tok.replace(/^\.\//, "")]);
        if (path.isAbsolute(tok)) {
          const rel = toRepoRelative(tok, root);
          if (rel) candidates.add(rel);
        }
        for (const candidate of candidates) {
          if (candidate && matchesProtected(candidate, patterns)) {
            block(teachingMessage(objective, candidate, true));
          }
        }
      }
      process.exit(0);
    }

    process.exit(0);
  } catch (err) {
    block("Mentor guard hook hit an unexpected error and fails closed: " + (err && err.message ? err.message : String(err)));
  }
}

main();
