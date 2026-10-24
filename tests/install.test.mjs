import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPlan } from "../scripts/install.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(repoRoot, "scripts", "install.mjs");
const skillNames = [
  "spec-flow-accept",
  "spec-flow-analyze",
  "spec-flow-build",
  "spec-flow-go",
  "spec-flow-patch",
  "spec-flow-plan",
  "spec-flow-review",
  "spec-flow-ship",
  "spec-flow-spec",
  "spec-flow-test",
  "spec-conventions",
  "spec-evidence-rules",
  "spec-scope-discipline",
  "spec-anydesign",
  "spec-deep-research",
  "spec-docx",
];

function run(args, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "spec-flow-install-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

test("default dry-run plans 16 skills without creating the Qoder directory", async (t) => {
  const home = await tempDir(t);
  const result = run([], { HOME: home, USERPROFILE: home });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY-RUN/);
  assert.match(result.stdout, /Planned: 16/);
  assert.equal(await exists(path.join(home, ".qoder")), false);
});

test("group selection plans flow, house-rule, or tool skills", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  const flow = run(["--group", "flow", "--dest", dest]);
  const rules = run(["--group", "house-rules", "--dest", dest]);
  const tools = run(["--group", "tools", "--dest", dest]);

  assert.equal(flow.status, 0, flow.stderr);
  assert.match(flow.stdout, /Planned: 10/);
  assert.equal(rules.status, 0, rules.stderr);
  assert.match(rules.stdout, /Planned: 3/);
  assert.equal(tools.status, 0, tools.stderr);
  assert.match(tools.stdout, /Planned: 3/);
  assert.equal(await exists(dest), false);
});

test("apply copies all 16 skills with identical SKILL.md files", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  const result = run(["--dest", dest, "--apply"]);

  assert.equal(result.status, 0, result.stderr);
  const installed = (await readdir(dest, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(installed, [...skillNames].sort());
  for (const resource of [
    "spec-flow-go/references/decision-tree.md",
    "spec-flow-go/scripts/validate.mjs",
    "spec-flow-spec/references/spec-template.md",
    "spec-flow-plan/references/plan-template.md",
    "spec-flow-review/references/review-checklist.md",
    "spec-flow-review/references/review-template.md",
    "spec-flow-accept/references/acceptance-template.md",
  ]) {
    await access(path.join(dest, resource));
  }

  for (const group of ["flow", "house-rules", "tools"]) {
    const groupRoot = path.join(repoRoot, "skills", group);
    for (const entry of await readdir(groupRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const expected = await readFile(path.join(groupRoot, entry.name, "SKILL.md"), "utf8");
      const name = expected.match(/^name:\s*(\S+)\s*$/m)[1];
      const actual = await readFile(path.join(dest, name, "SKILL.md"), "utf8");
      assert.equal(actual, expected);
    }
  }
});

test("a second apply is idempotent and reports 16 current skills", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  assert.equal(run(["--dest", dest, "--apply"]).status, 0);
  const target = path.join(dest, "spec-flow-analyze", "SKILL.md");
  const before = await readFile(target, "utf8");

  const result = run(["--dest", dest, "--apply"]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Current: 16/);
  assert.equal(await readFile(target, "utf8"), before);
});

test("a conflict aborts the whole apply before any write", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  assert.equal(run(["--dest", dest, "--group", "flow", "--apply"]).status, 0);
  const conflict = path.join(dest, "spec-flow-analyze", "SKILL.md");
  await writeFile(conflict, "user edit\n");

  const result = run(["--dest", dest, "--apply"]);

  assert.equal(result.status, 2);
  assert.equal(await readFile(conflict, "utf8"), "user edit\n");
  assert.equal(await exists(path.join(dest, "spec-conventions")), false);
});

test("force backs up a conflict before replacing it", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  assert.equal(run(["--dest", dest, "--group", "flow", "--apply"]).status, 0);
  const conflict = path.join(dest, "spec-flow-analyze", "SKILL.md");
  await writeFile(conflict, "user edit\n");

  const result = run(["--dest", dest, "--apply", "--force"]);

  assert.equal(result.status, 0, result.stderr);
  const expected = await readFile(
    path.join(repoRoot, "skills", "flow", "analyze", "SKILL.md"),
    "utf8",
  );
  assert.equal(await readFile(conflict, "utf8"), expected);
  const backups = (await readdir(dest)).filter((name) =>
    name.startsWith("spec-flow-analyze.backup-"),
  );
  assert.equal(backups.length, 1);
  assert.equal(await readFile(path.join(dest, backups[0], "SKILL.md"), "utf8"), "user edit\n");
});

test("all-target dry-run covers Qoder, Codex, Claude, and Cursor without writes", async (t) => {
  const home = await tempDir(t);
  const result = run(["--target", "all"], { HOME: home, USERPROFILE: home });

  assert.equal(result.status, 0, result.stderr);
  for (const directory of [".qoder", ".agents", ".claude", ".cursor"]) {
    assert.match(result.stdout, new RegExp(directory));
    assert.equal(await exists(path.join(home, directory)), false);
  }
});

test("safe upgrade uses the previous manifest and preserves local edits as conflicts", async (t) => {
  const root = await tempDir(t);
  const dest = path.join(root, "skills");
  assert.equal(run(["--dest", dest, "--apply"]).status, 0);
  const manifest = JSON.parse(await readFile(path.join(dest, ".spec-flow-manifest.json"), "utf8"));
  const upstream = path.join(root, "upstream");
  await cp(path.join(repoRoot, "skills", "flow", "analyze"), upstream, { recursive: true });
  await writeFile(path.join(upstream, "SKILL.md"), "\nupstream change\n", { flag: "a" });
  const skill = { name: "spec-flow-analyze", source: upstream };

  const update = await createPlan([skill], dest, manifest);
  assert.equal(update[0].status, "update");

  const installed = path.join(dest, "spec-flow-analyze", "SKILL.md");
  await writeFile(installed, "\nlocal edit\n", { flag: "a" });
  const conflict = await createPlan([skill], dest, manifest);
  assert.equal(conflict[0].status, "conflict");
  assert.match(await readFile(installed, "utf8"), /local edit/);
});

test("invalid arguments exit 1 with usage and no writes", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  const result = run(["--dest", dest, "--group", "unknown", "--apply"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
  assert.equal(await exists(dest), false);
});
