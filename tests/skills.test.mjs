import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const skillsRoot = path.join(repoRoot, "skills");
const toolsRoot = path.join(skillsRoot, "tools");

async function collectFiles(root, extension) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target, extension));
    else if (entry.isFile() && target.endsWith(extension)) files.push(target);
  }
  return files;
}

test("skill metadata, names, and local resources are valid", async () => {
  const names = new Set();
  for (const group of ["flow", "house-rules", "tools"]) {
    const groupRoot = path.join(skillsRoot, group);
    for (const entry of await readdir(groupRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillRoot = path.join(groupRoot, entry.name);
      const content = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
      const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
      assert.ok(frontmatter, `${entry.name} has valid frontmatter`);

      const name = frontmatter.match(/^name:\s*([a-z0-9][a-z0-9-]*)\s*$/m)?.[1];
      assert.ok(name, `${entry.name} has a hyphen-case name`);
      assert.equal(names.has(name), false, `duplicate skill name: ${name}`);
      names.add(name);
      if (group === "tools") assert.equal(entry.name, name);

      const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1];
      assert.ok(description, `${name} has a single-line description`);
      assert.ok(description.length <= 1024, `${name} description is too long`);
      assert.ok(content.split("\n").length <= 500, `${name} exceeds 500 lines`);
      assert.doesNotMatch(content, /TODO:/);
      const entries = await readdir(skillRoot);
      assert.equal(entries.includes("README.md"), false);
      assert.equal(entries.includes("CHANGELOG.md"), false);

      for (const markdown of await collectFiles(skillRoot, ".md")) {
        const text = await readFile(markdown, "utf8");
        for (const match of text.matchAll(/(?:<skill-dir>\/)?((?:scripts|references)\/[a-zA-Z0-9._-]+)/g)) {
          const prefix = text.slice(Math.max(0, match.index - 5), match.index);
          if (prefix === "node ") continue;
          await readFile(path.join(skillRoot, match[1]));
        }
      }
    }
  }
  assert.equal(names.size, 16);
});

test("bundled Python scripts compile without writing bytecode", async () => {
  const source = [
    "import pathlib, sys",
    "files = list(pathlib.Path(sys.argv[1]).rglob('*.py'))",
    "assert files",
    "for file in files:",
    "    compile(file.read_text(encoding='utf-8'), str(file), 'exec')",
    "print(f'Compiled {len(files)} scripts')",
  ].join("\n");
  const result = spawnSync("python", ["-c", source, toolsRoot], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Compiled 9 scripts/);
});

test("deep-research validator accepts complete results and rejects missing fields", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "spec-flow-research-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fields = path.join(dir, "fields.yaml");
  const complete = path.join(dir, "complete.json");
  const incomplete = path.join(dir, "incomplete.json");
  await writeFile(fields, [
    "fields:",
    "  基本信息:",
    "    - name: name",
    "      description: 名称",
    "    - name: release_date",
    "      description: 发布日期",
    "uncertain: []",
    "",
  ].join("\n"));
  await writeFile(complete, JSON.stringify({ name: "示例", release_date: "2026-01-01", uncertain: [] }));
  await writeFile(incomplete, JSON.stringify({ name: "示例", uncertain: ["release_date"] }));

  const validator = path.join(toolsRoot, "spec-deep-research", "scripts", "validate_json.py");
  const valid = spawnSync("python", [validator, "--fields", fields, "--json", complete], { encoding: "utf8" });
  const invalid = spawnSync("python", [validator, "--fields", fields, "--json", incomplete], { encoding: "utf8" });

  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /验证通过: 1\/1/);
  assert.equal(invalid.status, 1, invalid.stderr);
  assert.match(invalid.stdout, /release_date/);
});
