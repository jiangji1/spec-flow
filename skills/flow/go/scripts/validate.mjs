import { access, readFile } from "node:fs/promises";
import path from "node:path";

const stages = ["spec", "plan", "review", "accept"];
const usage = "Usage: node scripts/validate.mjs <feature-dir> [--stage spec|plan|review|accept] [--json]";

function parseArgs(args) {
  const options = { stage: "accept", json: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--stage") {
      options.stage = args[++index];
      if (!stages.includes(options.stage)) throw new Error("Invalid --stage");
    } else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else positional.push(arg);
  }
  if (!options.help && positional.length !== 1) throw new Error("Expected exactly one feature directory");
  if (positional.length === 1) options.featureDir = path.resolve(positional[0]);
  return options;
}

function frontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z-]+):\s*(.*)$/);
    if (field) result[field[1]] = field[2].trim();
  }
  return result;
}

async function readOptional(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function createContext(featureDir) {
  const issues = [];
  return {
    featureDir,
    issues,
    error(file, code, message) {
      issues.push({ level: "error", file: path.relative(featureDir, file) || path.basename(file), code, message });
    },
  };
}

function requireMeta(context, file, content, fields) {
  const meta = frontmatter(content);
  if (!meta) {
    context.error(file, "MISSING_FRONTMATTER", "缺少 YAML frontmatter");
    return {};
  }
  for (const field of fields) {
    if (!meta[field]) context.error(file, "MISSING_FIELD", `frontmatter 缺少 ${field}`);
  }
  if (meta.feature && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.feature)) {
    context.error(file, "INVALID_FEATURE", "feature 必须使用 kebab-case");
  }
  return meta;
}

function requireSections(context, file, content, sections) {
  for (const section of sections) {
    if (!new RegExp(`^## ${section}\\s*$`, "m").test(content)) {
      context.error(file, "MISSING_SECTION", `缺少章节：${section}`);
    }
  }
}

function validateSpec(context, file, content) {
  const meta = requireMeta(context, file, content, ["feature", "status", "source"]);
  context.specFeature = meta.feature;
  if (meta.feature && meta.feature !== path.basename(context.featureDir)) {
    context.error(file, "FEATURE_MISMATCH", `frontmatter feature 与目录名 ${path.basename(context.featureDir)} 不一致`);
  }
  requireSections(context, file, content, ["背景与目标", "业务口径", "验收标准", "影响面", "不改动范围", "待确认问题"]);
  const ids = [...content.matchAll(/^\|\s*(AC-\d+)\s*\|/gm)].map((match) => match[1]);
  if (ids.length === 0) context.error(file, "MISSING_AC", "验收标准中至少定义一个 AC-N 表格行");
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) context.error(file, "DUPLICATE_AC", `重复定义 ${id}`);
    seen.add(id);
  }
  return seen;
}

async function validateLinkedDocument(context, file, target) {
  if (!target) return;
  const resolved = path.resolve(context.featureDir, target);
  try {
    await access(resolved);
  } catch {
    context.error(file, "BROKEN_REFERENCE", `找不到关联文件：${target}`);
  }
}

function validatePlan(context, file, content, specIds) {
  const meta = requireMeta(context, file, content, ["feature", "status", "spec"]);
  if (meta.feature && context.specFeature && meta.feature !== context.specFeature) {
    context.error(file, "FEATURE_MISMATCH", `Plan feature 应与 Spec 的 ${context.specFeature} 一致`);
  }
  requireSections(context, file, content, ["技术方案", "改动清单", "改动最小化检查", "任务拆解", "跨产物一致性", "风险与回滚"]);
  const referencedIds = new Set(content.match(/AC-\d+/g) ?? []);
  for (const id of referencedIds) {
    if (!specIds.has(id)) context.error(file, "UNKNOWN_AC", `Plan 引用了 Spec 中不存在的 ${id}`);
  }

  const mappedIds = new Set();
  const headings = [...content.matchAll(/^###\s+Task\s+\d+.*$/gm)];
  if (headings.length === 0) context.error(file, "MISSING_TASK", "至少定义一个 ### Task N 任务");
  headings.forEach((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : content.length;
    const block = content.slice(start, end);
    for (const field of ["依据", "文件", "步骤", "验证", "关联验收"]) {
      if (!new RegExp(`^- \\*\\*${field}\\*\\*：\\S`, "m").test(block)) {
        context.error(file, "INCOMPLETE_TASK", `${heading[0]} 缺少有效字段：${field}`);
      }
    }
    const acceptanceField = block.match(/^- \*\*关联验收\*\*：(.+)$/m)?.[1] ?? "";
    for (const id of acceptanceField.match(/AC-\d+/g) ?? []) mappedIds.add(id);
  });
  for (const id of specIds) {
    if (!mappedIds.has(id)) context.error(file, "UNMAPPED_AC", `${id} 未被任何 Task 的关联验收字段覆盖`);
  }
  return validateLinkedDocument(context, file, meta.spec);
}

function conclusion(content) {
  return content.match(/^结论：\s*(PASS|PENDING|REJECT|FAIL)\s*$/m)?.[1] ?? null;
}

function validateReview(context, file, content) {
  const meta = requireMeta(context, file, content, ["feature", "status", "spec", "plan"]);
  if (meta.feature && context.specFeature && meta.feature !== context.specFeature) {
    context.error(file, "FEATURE_MISMATCH", `Review feature 应与 Spec 的 ${context.specFeature} 一致`);
  }
  requireSections(context, file, content, ["评审范围", "五维审查", "评审结论", "阻断项", "待裁决项", "豁免项"]);
  if (!conclusion(content)) context.error(file, "INVALID_CONCLUSION", "评审结论必须为 PASS、PENDING 或 REJECT");
  return Promise.all([
    validateLinkedDocument(context, file, meta.spec),
    validateLinkedDocument(context, file, meta.plan),
  ]);
}

function acceptanceRows(content) {
  const rows = [];
  let section = "";
  for (const line of content.split(/\r?\n/)) {
    if (line === "## 自动验证结果") section = "auto";
    else if (line === "## 手动验证结果") section = "manual";
    else if (line.startsWith("## ")) section = "";
    if (!section || !/^\|\s*AC-\d+\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const expectedCells = section === "auto" ? 4 : 5;
    if (cells.length !== expectedCells) {
      rows.push({ id: cells[0], section, result: "INVALID", evidence: "", invalid: true });
      continue;
    }
    rows.push({
      id: cells[0],
      section,
      result: cells[section === "auto" ? 2 : 3],
      evidence: cells[section === "auto" ? 3 : 4],
      invalid: false,
    });
  }
  return rows;
}

async function validateAcceptance(context, file, content, specIds) {
  const meta = requireMeta(context, file, content, ["feature", "status", "spec", "plan"]);
  if (meta.feature && context.specFeature && meta.feature !== context.specFeature) {
    context.error(file, "FEATURE_MISMATCH", `Acceptance feature 应与 Spec 的 ${context.specFeature} 一致`);
  }
  requireSections(context, file, content, ["验收概要", "自动验证结果", "手动验证结果", "缺口清单", "验收结论"]);
  for (const field of ["最后改动标识", "证据基线"]) {
    if (!new RegExp(`^- \\*\\*${field}\\*\\*：\\S`, "m").test(content)) {
      context.error(file, "MISSING_EVIDENCE_BASELINE", `验收概要缺少有效字段：${field}`);
    }
  }
  const rows = acceptanceRows(content);
  const seen = new Set();
  let hasFail = false;
  let hasManual = false;
  for (const row of rows) {
    if (!specIds.has(row.id)) context.error(file, "UNKNOWN_AC", `验收结果引用了不存在的 ${row.id}`);
    if (seen.has(row.id)) context.error(file, "DUPLICATE_RESULT", `${row.id} 出现重复验收结果`);
    seen.add(row.id);
    const allowed = row.section === "auto" ? ["PASS", "FAIL"] : ["PASS", "FAIL", "MANUAL"];
    if (row.invalid || !allowed.includes(row.result)) {
      context.error(file, "INVALID_RESULT", `${row.id} 的验证结果无效`);
    }
    if (!row.evidence) context.error(file, "MISSING_EVIDENCE", `${row.id} 缺少实际结果或证据`);
    if (row.result === "FAIL") hasFail = true;
    if (row.result === "MANUAL") hasManual = true;
  }
  for (const id of specIds) {
    if (!seen.has(id)) context.error(file, "UNCOVERED_AC", `${id} 没有自动或手动验收结果`);
  }
  const actualConclusion = conclusion(content);
  if (!["PASS", "PENDING", "FAIL"].includes(actualConclusion)) {
    context.error(file, "INVALID_CONCLUSION", "验收结论必须为 PASS、PENDING 或 FAIL");
  } else {
    const expected = hasFail ? "FAIL" : hasManual ? "PENDING" : "PASS";
    if (actualConclusion !== expected) {
      context.error(file, "CONCLUSION_MISMATCH", `根据用例结果，结论应为 ${expected}`);
    }
  }
  return Promise.all([
    validateLinkedDocument(context, file, meta.spec),
    validateLinkedDocument(context, file, meta.plan),
  ]);
}

async function validateFeature(featureDir, stage) {
  const context = createContext(featureDir);
  const specFile = path.join(featureDir, "spec.md");
  const spec = await readOptional(specFile);
  if (spec === null) {
    context.error(specFile, "MISSING_DOCUMENT", "缺少 spec.md");
    return { ok: false, featureDir, stage, issues: context.issues };
  }
  const specIds = validateSpec(context, specFile, spec);
  const required = {
    plan: path.join(featureDir, "plan.md"),
    review: path.join(featureDir, "review.md"),
    accept: path.join(featureDir, "acceptance.md"),
  };
  const stageIndex = stages.indexOf(stage);
  const plan = stageIndex >= 1 ? await readOptional(required.plan) : null;
  if (stageIndex >= 1 && plan === null) context.error(required.plan, "MISSING_DOCUMENT", "缺少 plan.md");
  if (plan) await validatePlan(context, required.plan, plan, specIds);
  const review = stageIndex >= 2 ? await readOptional(required.review) : null;
  if (stageIndex >= 2 && review === null) context.error(required.review, "MISSING_DOCUMENT", "缺少 review.md");
  if (review) await validateReview(context, required.review, review);
  const acceptance = stageIndex >= 3 ? await readOptional(required.accept) : null;
  if (stageIndex >= 3 && acceptance === null) context.error(required.accept, "MISSING_DOCUMENT", "缺少 acceptance.md");
  if (acceptance) await validateAcceptance(context, required.accept, acceptance, specIds);
  return { ok: context.issues.length === 0, featureDir, stage, issues: context.issues };
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
  const result = await validateFeature(options.featureDir, options.stage);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const issue of result.issues) {
      console.error(`[${issue.level.toUpperCase()}] ${issue.file} ${issue.code}: ${issue.message}`);
    }
    if (result.ok) console.log(`Validation passed: ${options.featureDir} (${options.stage})`);
    else console.error(`Validation failed: ${result.issues.length} issue(s)`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
}
