#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

import { DEFAULT_OPTIONS, install, readManifest } from "../lib/install.mjs";
import { uninstall } from "../lib/uninstall.mjs";

const packRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const USAGE = `create-mentor-mode - a per-repo AI workflow pack that teaches you to build your project

Usage:
  npx create-mentor-mode@latest [command] [target] [options]

Commands:
  install      add the pack to a repository (default)
  update       refresh pack files using the options already recorded, no prompts
  uninstall    remove what the installer created
  help         show this message

Target defaults to the current directory.

Install options answer the interview up front; anything unanswered is asked
interactively (or takes its default when not run from a terminal).

  --claude | --codex | --both   which harness to install for      (default: both)
  --vscode | --no-vscode        disable inline AI suggestions via
                                .vscode/settings.json             (default: no)
  --scratch | --no-scratch      create a scratch/ lab directory   (default: yes)
  --gitignore | --no-gitignore  add pack entries to .gitignore    (default: yes)
  --defaults                    take every default, ask nothing

Uninstall options:
  --purge                       also delete mentor/ state and scratch/`;

const KNOWN_FLAGS = new Set([
  "--claude", "--codex", "--both",
  "--vscode", "--no-vscode",
  "--scratch", "--no-scratch",
  "--gitignore", "--no-gitignore",
  "--defaults", "--yes",
  "--purge",
  "--help", "-h",
]);
const COMMANDS = new Set(["install", "update", "uninstall", "help"]);

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const argv = process.argv.slice(2);
let command = "install";
if (argv.length > 0 && COMMANDS.has(argv[0])) command = argv.shift();

const flags = new Set(argv.filter((a) => a.startsWith("-")));
const positional = argv.filter((a) => !a.startsWith("-"));
for (const f of flags) if (!KNOWN_FLAGS.has(f)) die("Unknown option: " + f + "\n\n" + USAGE);

if (command === "help" || flags.has("--help") || flags.has("-h")) {
  console.log(USAGE);
  process.exit(0);
}
if (positional.length > 1) die("Expected at most one target path.\n\n" + USAGE);
const target = path.resolve(positional[0] ?? process.cwd());

function printReport(report) {
  for (const a of report.actions ?? []) console.log("  + " + a);
  for (const s of report.skipped ?? []) console.log("  - " + s);
  for (const w of report.warnings ?? []) console.log("  ! " + w);
}

function enforcementNote(installClaude, installCodex) {
  if (installClaude && installCodex) {
    return "\nEnforcement: Claude Code gets the mechanical PreToolUse guard; Codex and other tools run on the AGENTS.md contract - policy, not a hard block.";
  }
  if (installClaude) {
    return "\nEnforcement: the PreToolUse guard hook blocks protected writes mechanically in Claude Code.";
  }
  return "\nEnforcement: no mechanical guard in this harness - the AGENTS.md rules block is the contract. The workflow relies on the tool honoring it.";
}

if (command === "uninstall") {
  try {
    const report = uninstall(target, { purge: flags.has("--purge") }, packRoot);
    console.log("Mentor Mode uninstalled from " + target);
    for (const n of report.notes) console.log(n);
    if (report.removed.length === 0) console.log("  nothing to remove");
    for (const r of report.removed) console.log("  - removed " + r);
    for (const k of report.kept) console.log("  = kept " + k);
  } catch (err) {
    die(err.message);
  }
  process.exit(0);
}

// The interview covers machine-level choices only. Learner-level questions
// (spec, background, cadence) belong to the mentor-init skill, not the installer.
const options = { harness: null, vscode: null, scratch: null, gitignore: null };
if (flags.has("--claude")) options.harness = "claude";
if (flags.has("--codex")) options.harness = "codex";
if (flags.has("--both")) options.harness = "both";
if (flags.has("--vscode")) options.vscode = true;
if (flags.has("--no-vscode")) options.vscode = false;
if (flags.has("--scratch")) options.scratch = true;
if (flags.has("--no-scratch")) options.scratch = false;
if (flags.has("--gitignore")) options.gitignore = true;
if (flags.has("--no-gitignore")) options.gitignore = false;

if (command === "update") {
  const manifest = readManifest(target);
  if (!manifest) {
    die("No readable .claude/mentor-manifest.json in " + target + "\nMentor Mode is not installed here (or was installed before manifests recorded options). Run install instead.");
  }
  const recorded = manifest.options && typeof manifest.options === "object" ? manifest.options : {};
  for (const key of Object.keys(options)) {
    if (options[key] === null) {
      options[key] = recorded[key] !== undefined ? recorded[key] : DEFAULT_OPTIONS[key];
    }
  }
} else {
  const takeDefaults = flags.has("--defaults") || flags.has("--yes") || !process.stdin.isTTY;
  if (takeDefaults) {
    for (const key of Object.keys(options)) {
      if (options[key] === null) options[key] = DEFAULT_OPTIONS[key];
    }
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (options.harness === null) {
        const a = (await rl.question("Install for which harness? [1] Claude Code  [2] Codex  [3] both (default 3): ")).trim();
        options.harness = a === "1" ? "claude" : a === "2" ? "codex" : "both";
      }
      if (options.vscode === null) {
        console.log("The learner is supposed to type the protected code; Copilot-style ghost text quietly defeats that.");
        const a = (await rl.question("Disable inline AI suggestions in this workspace via .vscode/settings.json? (y/N): ")).trim().toLowerCase();
        options.vscode = a === "y" || a === "yes";
      }
      if (options.scratch === null) {
        const a = (await rl.question("Create a scratch/ lab directory for experiments (unprotected, mentor-writable)? (Y/n): ")).trim().toLowerCase();
        options.scratch = !(a === "n" || a === "no");
      }
      if (options.gitignore === null && options.scratch) {
        const a = (await rl.question("Add scratch/ to .gitignore? (Y/n): ")).trim().toLowerCase();
        options.gitignore = !(a === "n" || a === "no");
      }
    } finally {
      rl.close();
    }
    for (const key of Object.keys(options)) {
      if (options[key] === null) options[key] = key === "gitignore" ? options.scratch : DEFAULT_OPTIONS[key];
    }
  }
}

let report;
try {
  report = install(target, options, packRoot);
} catch (err) {
  die(err.message);
}

console.log((command === "update" ? "Mentor Mode updated in " : "Mentor Mode installed into ") + target);
printReport(report);
console.log(enforcementNote(report.installClaude, report.installCodex));
if (command === "update") {
  console.log("Learner state in mentor/ was left untouched.");
} else if (!options.vscode) {
  console.log("Note: inline AI suggestions were left as-is. If your editor shows AI ghost text, disable it for this repo - protected code should come from the learner's own recall (re-run with --vscode to do it for VS Code).");
}
if (command !== "update" && !fs.existsSync(path.join(target, ".git"))) {
  console.log("Note: this directory is not a git repository. Mentor Mode expects one - run git init before your first session.");
}
