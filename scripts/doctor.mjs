import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createPlan, discoverSkills, readManifest, targetDirectory } from "./install.mjs";

const targetNames = ["qoder", "claude", "codex", "cursor"];
const usage = "Usage: node scripts/doctor.mjs [--target all|qoder|claude|codex|cursor | --dest <dir>] [--json] [--strict]";

function parseArgs(args) {
  const options = { target: "qoder", json: false, strict: false };
  let targetSelected = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      options.target = args[++index];
      if (!["all", ...targetNames].includes(options.target)) throw new Error("Invalid --target");
      targetSelected = true;
    } else if (arg === "--dest") {
      options.dest = args[++index];
      if (!options.dest) throw new Error("Missing --dest value");
    } else if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.dest && targetSelected) throw new Error("--dest and --target are mutually exclusive");
  return options;
}

async function collectMarkdown(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectMarkdown(target));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(target);
  }
  return files;
}

async function checkLocalLinks(skill, issues) {
  for (const file of await collectMarkdown(skill.source)) {
    const content = await readFile(file, "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().split(/\s+/)[0];
      if (!target || target.startsWith("#") || target.startsWith("<") || target.includes("{{")) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || path.isAbsolute(target)) continue;
      const cleanTarget = target.split("#")[0];
      if (!cleanTarget) continue;
      try {
        await access(path.resolve(path.dirname(file), cleanTarget));
      } catch {
        issues.push({ level: "error", code: "BROKEN_LINK", message: `${skill.name}: ${path.relative(skill.source, file)} -> ${cleanTarget}` });
      }
    }
    for (const match of content.matchAll(/<skill-dir>\/((?:scripts|references)\/[a-zA-Z0-9._-]+)/g)) {
      try {
        await access(path.join(skill.source, match[1]));
      } catch {
        issues.push({ level: "error", code: "MISSING_RESOURCE", message: `${skill.name}: ${path.relative(skill.source, file)} -> ${match[1]}` });
      }
    }
  }
}

function summarize(plan, issues) {
  return {
    current: plan.filter((item) => item.status === "current").length,
    notInstalled: plan.filter((item) => item.status === "copy").length,
    updates: plan.filter((item) => item.status === "update").length,
    different: plan.filter((item) => item.status === "conflict").length,
    warnings: issues.filter((issue) => issue.level === "warn").length,
    errors: issues.filter((issue) => issue.level === "error").length,
  };
}

async function inspect(target, dest, strict, skills, sourceIssues) {
  const issues = [...sourceIssues];
  const manifest = await readManifest(dest);
  const plan = await createPlan(skills, dest, manifest);
  for (const item of plan) {
    if (item.status === "copy") issues.push({ level: "warn", code: "NOT_INSTALLED", message: `${item.name}: 尚未安装到目标目录` });
    else if (item.status === "update") issues.push({ level: "warn", code: "UPDATE_AVAILABLE", message: `${item.name}: 有安全更新，可重新安装` });
    else if (item.status === "conflict") issues.push({ level: "warn", code: "LOCAL_DIFF", message: `${item.name}: 已安装内容与源及上次清单均不一致，更新前需确认本地修改` });
  }
  const summary = summarize(plan, issues);
  const ok = summary.errors === 0 && (!strict || summary.warnings === 0);
  return { ok, strict, target, dest, summary, issues };
}

async function run(options) {
  const skills = await discoverSkills("all");
  const sourceIssues = [];
  for (const skill of skills) await checkLocalLinks(skill, sourceIssues);
  const targets = options.dest
    ? [{ name: "custom", dest: path.resolve(options.dest) }]
    : (options.target === "all" ? targetNames : [options.target]).map((name) => ({ name, dest: targetDirectory(name) }));
  const reports = [];
  for (const target of targets) reports.push(await inspect(target.name, target.dest, options.strict, skills, sourceIssues));
  if (reports.length === 1) return reports[0];
  const issues = reports.flatMap((report) => report.issues.map((issue) => ({ ...issue, target: report.target })));
  const summary = reports.reduce((total, report) => {
    for (const key of Object.keys(total)) total[key] += report.summary[key];
    return total;
  }, { current: 0, notInstalled: 0, updates: 0, different: 0, warnings: 0, errors: 0 });
  return { ok: reports.every((report) => report.ok), strict: options.strict, target: "all", summary, issues, targets: reports };
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  console.error(usage);
  process.exit(1);
}
if (options.help) {
  console.log(usage);
  process.exit(0);
}
try {
  const result = await run(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    const reports = result.targets ?? [result];
    for (const report of reports) {
      console.log(`Doctor target: ${report.target} (${report.dest})`);
      for (const issue of report.issues) console.log(`[${issue.level.toUpperCase()}] ${issue.code}: ${issue.message}`);
      console.log(`Current: ${report.summary.current}; Updates: ${report.summary.updates}; Not installed: ${report.summary.notInstalled}; Different: ${report.summary.different}`);
      console.log(`Warnings: ${report.summary.warnings}; Errors: ${report.summary.errors}; ${report.ok ? "OK" : "FAILED"}`);
    }
    console.log(result.ok ? "Doctor passed" : "Doctor failed");
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`Doctor failed: ${error.message}`);
  process.exitCode = 1;
}
