import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const groups = ["flow", "house-rules", "tools"];
const targetPaths = {
  qoder: [".qoder", "skills"],
  claude: [".claude", "skills"],
  codex: [".agents", "skills"],
  cursor: [".cursor", "skills"],
};
const targetNames = Object.keys(targetPaths);
const manifestName = ".spec-flow-manifest.json";
const usage = "Usage: node scripts/install.mjs [--target all|qoder|claude|codex|cursor | --dest <dir>] [--group all|flow|house-rules|tools] [--apply] [--force]";

class UsageError extends Error {}

export function targetDirectory(target) {
  const segments = targetPaths[target];
  if (!segments) throw new Error(`Unknown target: ${target}`);
  return path.join(homedir(), ...segments);
}

function parseArgs(args) {
  const options = { apply: false, force: false, group: "all", target: "qoder" };
  let targetSelected = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--target") {
      const value = args[++index];
      if (!["all", ...targetNames].includes(value)) throw new UsageError("Invalid --target");
      options.target = value;
      targetSelected = true;
    } else if (arg === "--dest") {
      const value = args[++index];
      if (!value) throw new UsageError("Missing --dest value");
      options.dest = value;
    } else if (arg === "--group") {
      const value = args[++index];
      if (!["all", ...groups].includes(value)) throw new UsageError("Invalid --group");
      options.group = value;
    } else throw new UsageError(`Unknown argument: ${arg}`);
  }

  if (options.dest && targetSelected) throw new UsageError("--dest and --target are mutually exclusive");
  return { options, help };
}

export async function discoverSkills(group) {
  const selectedGroups = group === "all" ? groups : [group];
  const skills = [];
  const names = new Set();

  for (const selectedGroup of selectedGroups) {
    const groupRoot = path.join(repoRoot, "skills", selectedGroup);
    const entries = await readdir(groupRoot, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const source = path.join(groupRoot, entry.name);
      const skillFile = path.join(source, "SKILL.md");
      try {
        await access(skillFile, constants.R_OK);
      } catch {
        continue;
      }
      const content = await readFile(skillFile, "utf8");
      const name = content.match(/^name:\s*([a-z0-9][a-z0-9-]*)\s*$/m)?.[1];
      if (!name) throw new Error(`Invalid skill name in ${skillFile}`);
      if (names.has(name)) throw new Error(`Duplicate skill name: ${name}`);
      names.add(name);
      skills.push({ name, source });
    }
  }
  return skills;
}

async function walkFiles(root, base = root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(target, base));
    else if (entry.isFile()) files.push(path.relative(base, target).split(path.sep).join("/"));
  }
  return files.sort();
}

async function hashDirectory(root) {
  const hashes = {};
  for (const relative of await walkFiles(root)) {
    const content = await readFile(path.join(root, relative));
    hashes[relative] = createHash("sha256").update(content).digest("hex");
  }
  return hashes;
}

async function directoriesEqual(left, right) {
  const [leftEntries, rightEntries] = await Promise.all([
    readdir(left, { withFileTypes: true }),
    readdir(right, { withFileTypes: true }),
  ]);
  const sortEntries = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name));
  sortEntries(leftEntries);
  sortEntries(rightEntries);
  if (leftEntries.length !== rightEntries.length) return false;

  for (let index = 0; index < leftEntries.length; index += 1) {
    const a = leftEntries[index];
    const b = rightEntries[index];
    if (a.name !== b.name || a.isDirectory() !== b.isDirectory() || a.isFile() !== b.isFile()) return false;
    const leftPath = path.join(left, a.name);
    const rightPath = path.join(right, a.name);
    if (a.isDirectory()) {
      if (!(await directoriesEqual(leftPath, rightPath))) return false;
    } else if (a.isFile()) {
      const [leftContent, rightContent] = await Promise.all([readFile(leftPath), readFile(rightPath)]);
      if (!leftContent.equals(rightContent)) return false;
    } else return false;
  }
  return true;
}

function hashesEqual(left, right) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

async function matchesManifest(target, expected) {
  try {
    return hashesEqual(await hashDirectory(target), expected);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function readManifest(dest) {
  try {
    return JSON.parse(await readFile(path.join(dest, manifestName), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function createPlan(skills, dest, manifest = null) {
  const plan = [];
  for (const skill of skills) {
    const target = path.join(dest, skill.name);
    let status = "copy";
    try {
      const targetStat = await lstat(target);
      if (targetStat.isDirectory() && await directoriesEqual(skill.source, target)) status = "current";
      else if (manifest?.skills?.[skill.name] && await matchesManifest(target, manifest.skills[skill.name])) status = "update";
      else status = "conflict";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    plan.push({ ...skill, target, status });
  }
  return plan;
}

function printPlan(plan, dest, apply) {
  console.log(`Target: ${dest}`);
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Planned: ${plan.length}`);
  for (const item of plan) console.log(`[${item.status}] ${item.name}`);
  for (const status of ["copy", "update", "current", "conflict"]) {
    const label = status[0].toUpperCase() + status.slice(1);
    console.log(`${label}: ${plan.filter((item) => item.status === status).length}`);
  }
}

async function applyPlan(plan, dest, force) {
  await mkdir(dest, { recursive: true });
  for (const item of plan) {
    if (item.status === "current") continue;
    if (item.status === "conflict") {
      if (!force) throw new Error("Conflict reached apply without --force");
      const backup = `${item.target}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      await rename(item.target, backup);
      console.log(`Backup: ${backup}`);
    } else if (item.status === "update") {
      await rm(item.target, { recursive: true, force: true });
    }
    await cp(item.source, item.target, { recursive: true });
  }
}

async function writeManifest(dest, skills, previous) {
  const nextSkills = { ...(previous?.skills ?? {}) };
  for (const skill of skills) nextSkills[skill.name] = await hashDirectory(skill.source);
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  const manifest = { name: packageJson.name, version: packageJson.version, skills: nextSkills };
  await mkdir(dest, { recursive: true });
  await writeFile(path.join(dest, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    console.error(usage);
    return 1;
  }
  if (parsed.help) {
    console.log(usage);
    return 0;
  }

  const { options } = parsed;
  const targets = options.dest
    ? [{ name: "custom", dest: path.resolve(options.dest) }]
    : (options.target === "all" ? targetNames : [options.target]).map((name) => ({ name, dest: targetDirectory(name) }));
  const skills = await discoverSkills(options.group);
  const installations = [];
  for (const target of targets) {
    const manifest = await readManifest(target.dest);
    const plan = await createPlan(skills, target.dest, manifest);
    installations.push({ ...target, manifest, plan });
    printPlan(plan, target.dest, options.apply);
  }

  const hasConflicts = installations.some((item) => item.plan.some((entry) => entry.status === "conflict"));
  if (hasConflicts && !options.force) {
    console.error("Conflicts detected; no files written to any target. Use --force to back up and replace them.");
    return 2;
  }
  if (options.apply) {
    for (const item of installations) {
      await applyPlan(item.plan, item.dest, options.force);
      await writeManifest(item.dest, skills, item.manifest);
    }
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`Install failed: ${error.message}`);
    process.exitCode = 1;
  }
}
