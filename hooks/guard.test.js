import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hookPath = fileURLToPath(new URL("./mentor-guard.mjs", import.meta.url));
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function makeRepo(guard) {
  // realpathSync avoids symlinked tmpdir mismatches (macOS /var vs /private/var).
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mentor-guard-")));
  tempDirs.push(dir);
  if (guard !== undefined) {
    fs.mkdirSync(path.join(dir, "mentor"), { recursive: true });
    const body = typeof guard === "string" ? guard : JSON.stringify(guard, null, 2);
    fs.writeFileSync(path.join(dir, "mentor", "guard.json"), body);
  }
  return dir;
}

function runHook(cwd, payload, envOverrides) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, envOverrides || {});
  const res = spawnSync(process.execPath, [hookPath], {
    cwd,
    env,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  return { code: res.status, stderr: res.stderr };
}

function baseGuard(overrides = {}) {
  return {
    mode: "on",
    activeObjective: {
      id: "obj-scanner",
      title: "Build the scanner",
      protectedPaths: ["packages/scanner/src/**"],
    },
    reveal: { active: false, objectiveId: null, grantedAt: null },
    revealQueue: [],
    ...overrides,
  };
}

function writePayload(filePath) {
  return { tool_name: "Write", tool_input: { file_path: filePath, content: "x" } };
}

function bashPayload(command) {
  return { tool_name: "Bash", tool_input: { command } };
}

test("no guard file allows everything", () => {
  const dir = makeRepo(undefined);
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});

test("corrupt guard JSON fails closed", () => {
  const dir = makeRepo("{ this is not json");
  const res = runHook(dir, writePayload("anything.ts"));
  assert.equal(res.code, 2);
  assert.match(res.stderr, /fails closed/i);
});

test("mode off allows protected write", () => {
  const dir = makeRepo(baseGuard({ mode: "off" }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});

test("protected Write is blocked and stderr names the objective", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
  assert.match(res.stderr, /obj-scanner/);
  assert.match(res.stderr, /Build the scanner/);
  assert.match(res.stderr, /\/reveal/);
});

test("unprotected Write is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, writePayload("packages/scanner/test/index.test.ts"));
  assert.equal(res.code, 0);
});

test("protected NotebookEdit via notebook_path is blocked", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, {
    tool_name: "NotebookEdit",
    tool_input: { notebook_path: "packages/scanner/src/notes.ipynb" },
  });
  assert.equal(res.code, 2);
  assert.match(res.stderr, /obj-scanner/);
});

test("absolute path inside repo that matches is blocked", () => {
  const dir = makeRepo(baseGuard());
  const abs = path.join(dir, "packages", "scanner", "src", "index.ts");
  const res = runHook(dir, writePayload(abs));
  assert.equal(res.code, 2);
});

test("absolute path outside repo is allowed", () => {
  const dir = makeRepo(baseGuard());
  const outside = path.join(os.tmpdir(), "mentor-outside", "packages", "scanner", "src", "index.ts");
  const res = runHook(dir, writePayload(outside));
  assert.equal(res.code, 0);
});

test("reveal granted just now with matching objectiveId allows the write", () => {
  const dir = makeRepo(baseGuard({
    reveal: { active: true, objectiveId: "obj-scanner", grantedAt: new Date().toISOString() },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});

test("reveal active with different objectiveId still blocks", () => {
  const dir = makeRepo(baseGuard({
    reveal: { active: true, objectiveId: "obj-other", grantedAt: new Date().toISOString() },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("reveal granted 3 hours ago does not unlock", () => {
  const stale = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const dir = makeRepo(baseGuard({
    reveal: { active: true, objectiveId: "obj-scanner", grantedAt: stale },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("reveal with missing grantedAt does not unlock", () => {
  const dir = makeRepo(baseGuard({
    reveal: { active: true, objectiveId: "obj-scanner", grantedAt: null },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("double-star glob matches nested files", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, writePayload("packages/scanner/src/lib/deep/parse.ts"));
  assert.equal(res.code, 2);
});

test("double-star glob does not match a sibling package", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, writePayload("packages/shared/src/x.ts"));
  assert.equal(res.code, 0);
});

test("basename pattern matches at any depth", () => {
  const dir = makeRepo(baseGuard({
    activeObjective: { id: "obj-1", title: "Secrets", protectedPaths: ["*.secret"] },
  }));
  const res = runHook(dir, writePayload("a/b/c.secret"));
  assert.equal(res.code, 2);
});

test("directory pattern with trailing slash blocks nested writes", () => {
  const dir = makeRepo(baseGuard({
    activeObjective: { id: "obj-1", title: "Scanner", protectedPaths: ["packages/scanner/src/"] },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/lib/x.ts"));
  assert.equal(res.code, 2);
});

test("bare literal directory pattern blocks nested writes", () => {
  const dir = makeRepo(baseGuard({
    activeObjective: { id: "obj-1", title: "Scanner", protectedPaths: ["packages/scanner/src"] },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/lib/x.ts"));
  assert.equal(res.code, 2);
});

test("pattern with braces fails closed with unsupported-syntax message", () => {
  const dir = makeRepo(baseGuard({
    activeObjective: { id: "obj-1", title: "Scanner", protectedPaths: ["src/{a,b}/**"] },
  }));
  const res = runHook(dir, writePayload("anything.ts"));
  assert.equal(res.code, 2);
  assert.match(res.stderr, /unsupported glob syntax/);
});

test("CLAUDE_PROJECT_DIR resolves the repo when cwd is elsewhere", () => {
  const dir = makeRepo(baseGuard());
  const elsewhere = makeRepo(undefined);
  const res = runHook(elsewhere, writePayload("packages/scanner/src/index.ts"), {
    CLAUDE_PROJECT_DIR: dir,
  });
  assert.equal(res.code, 2);
  assert.match(res.stderr, /obj-scanner/);
});

test("Bash redirect into a protected path is blocked", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("echo hi > packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
  assert.match(res.stderr, /Shell writes/);
});

test("Bash echo redirect blocks", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("echo x > packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("Bash tee into a protected path is blocked", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("tee packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("Bash sed -i on a protected path is blocked", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("sed -i 's/x/y/' packages/scanner/src/index.ts"));
  assert.equal(res.code, 2);
});

test("Bash mv of a protected path is blocked", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("mv packages/scanner/src/index.ts /tmp/elsewhere"));
  assert.equal(res.code, 2);
});

test("Bash read of a protected path is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("cat packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});

test("Bash grep with quoted arrow on a protected file is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload('grep -n "=>" packages/scanner/src/index.ts'));
  assert.equal(res.code, 0);
});

test("Bash git log with quoted format arrow is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload('git log --format="%h -> %s" -- packages/scanner/src/index.ts'));
  assert.equal(res.code, 0);
});

test("Bash redirect of protected read to an outside file is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("wc -l packages/scanner/src/index.ts > /tmp/out.txt"));
  assert.equal(res.code, 0);
});

test("Bash npm install chained with protected read is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("npm install && cat packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});

test("Bash command with no protected paths is allowed", () => {
  const dir = makeRepo(baseGuard());
  const res = runHook(dir, bashPayload("git status"));
  assert.equal(res.code, 0);
});

test("empty protectedPaths allows everything", () => {
  const dir = makeRepo(baseGuard({
    activeObjective: { id: "obj-scanner", title: "Build the scanner", protectedPaths: [] },
  }));
  const res = runHook(dir, writePayload("packages/scanner/src/index.ts"));
  assert.equal(res.code, 0);
});
