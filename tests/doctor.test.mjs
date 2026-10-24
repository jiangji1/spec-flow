import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const doctor = path.join(repoRoot, "scripts", "doctor.mjs");
const install = path.join(repoRoot, "scripts", "install.mjs");

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

async function tempDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "spec-flow-doctor-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("doctor reports missing installations as warnings without writing files", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  const result = run(doctor, ["--dest", dest, "--json"]);
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.ok, true);
  assert.equal(report.summary.notInstalled, 16);
  assert.equal(report.summary.errors, 0);
});

test("doctor strict passes after installation and detects later local differences", async (t) => {
  const dest = path.join(await tempDir(t), "skills");
  assert.equal(run(install, ["--dest", dest, "--apply"]).status, 0);

  const healthy = run(doctor, ["--dest", dest, "--strict", "--json"]);
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.equal(JSON.parse(healthy.stdout).summary.current, 16);
  const bundledValidator = run(doctor.replace(/doctor\.mjs$/, "validate.mjs"), ["--help"]);
  assert.equal(bundledValidator.status, 0, bundledValidator.stderr);
  const installedValidator = path.join(dest, "spec-flow-go", "scripts", "validate.mjs");
  const portable = run(installedValidator, ["--help"]);
  assert.equal(portable.status, 0, portable.stderr);
  assert.match(portable.stdout, /--stage/);

  const target = path.join(dest, "spec-flow-analyze", "SKILL.md");
  const original = await readFile(target, "utf8");
  await writeFile(target, `${original}\nlocal edit\n`);
  const drifted = run(doctor, ["--dest", dest, "--strict", "--json"]);
  const report = JSON.parse(drifted.stdout);

  assert.equal(drifted.status, 1);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some((issue) => issue.code === "LOCAL_DIFF"));
});
