// Packs the tarball, installs it, and runs the packed CLI against a throwaway
// repo. This is what catches a missing "files" entry before a user does.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mentor-smoke-")));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log("  ok   " + label);
  } catch (err) {
    failures += 1;
    console.log("  FAIL " + label + "\n       " + err.message.split("\n")[0]);
  }
}

try {
  console.log("packing tarball");
  // Read the tarball off disk rather than parsing `npm pack --json`, whose
  // output shape has moved between npm versions.
  execFileSync(npm, ["pack", "--pack-destination", work], { cwd: packRoot, encoding: "utf8" });
  const tarballs = fs.readdirSync(work).filter((f) => f.endsWith(".tgz"));
  if (tarballs.length !== 1) {
    throw new Error("expected exactly one packed tarball, found " + JSON.stringify(tarballs));
  }
  const tarball = path.join(work, tarballs[0]);

  console.log("installing tarball into a clean prefix");
  const prefix = path.join(work, "prefix");
  fs.mkdirSync(prefix);
  fs.writeFileSync(path.join(prefix, "package.json"), JSON.stringify({ name: "smoke-host", private: true }) + "\n");
  execFileSync(npm, ["install", "--no-audit", "--no-fund", tarball], { cwd: prefix, encoding: "utf8" });

  const cli = path.join(prefix, "node_modules", "create-mentor-mode", "bin", "create-mentor-mode.js");
  check("bin ships in the tarball", () => assert.ok(fs.existsSync(cli)));

  const repo = path.join(work, "repo");
  fs.mkdirSync(repo);
  fs.mkdirSync(path.join(repo, ".git"));

  console.log("running the packed CLI against a throwaway repo");
  const out = execFileSync(process.execPath, [cli, repo, "--defaults"], { encoding: "utf8" });
  check("install reports success", () => assert.match(out, /Mentor Mode installed into/));

  const expected = [
    ".claude/skills/mentor/SKILL.md",
    ".claude/skills/mentor-init/SKILL.md",
    ".claude/skills/mentor-wrap/SKILL.md",
    ".claude/agents/quizmaster.md",
    ".claude/agents/curriculum-planner.md",
    ".claude/hooks/mentor-guard.mjs",
    ".claude/settings.json",
    ".claude/mentor-manifest.json",
    ".agents/skills/mentor/SKILL.md",
    ".agents/agents/quizmaster.md",
    "mentor/curriculum.md",
    "mentor/config.json",
    "mentor/guard.json",
    "mentor/ledger.md",
    "mentor/sessions/_template.md",
    "scratch/README.md",
    ".gitignore",
    "CLAUDE.md",
    "AGENTS.md",
  ];
  for (const rel of expected) {
    check("installs " + rel, () => assert.ok(fs.existsSync(path.join(repo, rel)), rel + " missing"));
  }

  check("guard hook is runnable from the install", () => {
    const res = execFileSync(process.execPath, [path.join(repo, ".claude", "hooks", "mentor-guard.mjs")], {
      input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "README.md" } }),
      cwd: repo,
      encoding: "utf8",
    });
    assert.equal(typeof res, "string");
  });

  check("rules block landed in CLAUDE.md", () =>
    assert.match(fs.readFileSync(path.join(repo, "CLAUDE.md"), "utf8"), /mentor-mode:begin/));

  console.log("running update");
  const updateOut = execFileSync(process.execPath, [cli, "update", repo], { encoding: "utf8" });
  check("update reuses recorded options", () => assert.match(updateOut, /Mentor Mode updated in/));
  check("update leaves learner state", () =>
    assert.ok(fs.existsSync(path.join(repo, "mentor", "curriculum.md"))));

  console.log("running uninstall");
  const removeOut = execFileSync(process.execPath, [cli, "uninstall", repo], { encoding: "utf8" });
  check("uninstall reports success", () => assert.match(removeOut, /Mentor Mode uninstalled from/));
  check("uninstall removes the hook", () =>
    assert.ok(!fs.existsSync(path.join(repo, ".claude", "hooks", "mentor-guard.mjs"))));
  check("uninstall keeps mentor/ state", () =>
    assert.ok(fs.existsSync(path.join(repo, "mentor", "curriculum.md"))));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

if (failures > 0) {
  console.error("\n" + failures + " smoke check(s) failed");
  process.exit(1);
}
console.log("\nall smoke checks passed");
