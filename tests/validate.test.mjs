import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(repoRoot, "scripts", "validate.mjs");

const spec = `---
feature: order-export
status: spec-confirmed
source: user-request
---
# Spec
## 背景与目标
导出订单。
## 业务口径
| # | 口径 | 来源 |
|---|---|---|
| 1 | 仅导出筛选结果 | 【文档】需求原文 |
## 验收标准
| 编号 | Given | When | Then | 来源 |
|---|---|---|---|---|
| AC-1 | 有 2 条结果 | 点击导出 | 文件恰好 2 行 | #1 |
| AC-2 | 无结果 | 点击导出 | 按钮不可用 | #1 |
## 影响面
订单页。
## 不改动范围
其他页面。
## 待确认问题
无。
`;

const plan = `---
feature: order-export
status: plan-confirmed
spec: spec.md
---
# Plan
## 技术方案
复用现有导出链路。
## 改动清单
| 文件 | 改动 | 理由 |
|---|---|---|
| src/order.ts | 接入筛选条件 | AC-1 |
## 改动最小化检查
不改其他页面。
## 任务拆解
### Task 1：导出筛选结果
- **依据**：AC-1、AC-2
- **文件**：src/order.ts
- **步骤**：读取筛选结果并导出
- **验证**：TEST-1，导出 2 行；TEST-2，空结果禁用
- **关联验收**：AC-1、AC-2
## 跨产物一致性
Task 行为满足 AC，不导出全部数据，验证能证明 AC。
## 数据与接口
沿用现有接口。
## 风险与回滚
回退 src/order.ts。
`;

const review = `---
feature: order-export
status: done
spec: spec.md
plan: plan.md
---
# Review
## 评审范围
当前 diff。
## 五维审查
五维均有依据。
## 评审结论
结论：PASS
## 阻断项
无。
## 待裁决项
无。
## 豁免项
无。
## 已修复问题
无。
## 未覆盖验证
无。
`;

const acceptance = `---
feature: order-export
status: pending
spec: spec.md
plan: plan.md
---
# Acceptance
## 验收概要
AI 与人工验收。
- **最后改动标识**：当前 diff
- **证据基线**：最后改动后重跑 TEST-1、TEST-2
## 自动验证结果
| 编号 | 验证方式 | 结果 | 实际结果与证据 |
|---|---|---|---|
| AC-1 | TEST-1 | PASS | 2 行，测试退出码 0 |
## 手动验证结果
| 编号 | 操作与入口 | 精确预期值 | 结果 | 实际结果 |
|---|---|---|---|---|
| AC-2 | 既有订单页清空筛选 | 导出按钮禁用 | MANUAL | 等待用户反馈 |
## 缺口清单
仅剩 AC-2 人工验证。
## 验收结论
结论：PENDING
`;

function run(featureDir, stage, json = true) {
  const args = [script, featureDir, "--stage", stage];
  if (json) args.push("--json");
  return spawnSync(process.execPath, args, { encoding: "utf8" });
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "spec-flow-validate-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const featureDir = path.join(root, ".spec-flow-workspace", "order-export");
  await mkdir(featureDir, { recursive: true });
  await writeFile(path.join(featureDir, "spec.md"), spec);
  return featureDir;
}

test("spec stage validates without requiring downstream documents", async (t) => {
  const featureDir = await fixture(t);
  const result = run(featureDir, "spec");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("accept stage validates AC coverage and a pending manual result", async (t) => {
  const featureDir = await fixture(t);
  await writeFile(path.join(featureDir, "plan.md"), plan);
  await writeFile(path.join(featureDir, "review.md"), review);
  await writeFile(path.join(featureDir, "acceptance.md"), acceptance);

  const result = run(featureDir, "accept");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
});

test("plan stage rejects unknown and uncovered AC references", async (t) => {
  const featureDir = await fixture(t);
  const invalidPlan = plan.replaceAll("AC-2", "AC-3");
  await writeFile(path.join(featureDir, "plan.md"), invalidPlan);

  const result = run(featureDir, "plan");
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.ok(report.issues.some((issue) => issue.code === "UNKNOWN_AC" && issue.message.includes("AC-3")));
  assert.ok(report.issues.some((issue) => issue.code === "UNMAPPED_AC" && issue.message.includes("AC-2")));
});

test("plan stage does not count AC mentions outside Task acceptance mappings", async (t) => {
  const featureDir = await fixture(t);
  const invalidPlan = plan.replace("- **关联验收**：AC-1、AC-2", "- **关联验收**：AC-1");
  await writeFile(path.join(featureDir, "plan.md"), invalidPlan);

  const result = run(featureDir, "plan");
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.ok(report.issues.some((issue) => issue.code === "UNMAPPED_AC" && issue.message.includes("AC-2")));
});

test("accept stage rejects missing evidence, uncovered AC, and inconsistent conclusion", async (t) => {
  const featureDir = await fixture(t);
  await writeFile(path.join(featureDir, "plan.md"), plan);
  await writeFile(path.join(featureDir, "review.md"), review);
  const invalidAcceptance = acceptance
    .replace("| AC-1 | TEST-1 | PASS | 2 行，测试退出码 0 |", "| AC-1 | TEST-1 | PASS |  |")
    .replace("结论：PENDING", "结论：PASS");
  await writeFile(path.join(featureDir, "acceptance.md"), invalidAcceptance);

  const result = run(featureDir, "accept");
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_EVIDENCE"));
  assert.ok(report.issues.some((issue) => issue.code === "CONCLUSION_MISMATCH"));
});

test("accept stage requires a post-change evidence baseline", async (t) => {
  const featureDir = await fixture(t);
  await writeFile(path.join(featureDir, "plan.md"), plan);
  await writeFile(path.join(featureDir, "review.md"), review);
  const invalidAcceptance = acceptance.replace("- **证据基线**：最后改动后重跑 TEST-1、TEST-2\n", "");
  await writeFile(path.join(featureDir, "acceptance.md"), invalidAcceptance);

  const result = run(featureDir, "accept");
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.ok(report.issues.some((issue) => issue.code === "MISSING_EVIDENCE_BASELINE"));
});

test("accept stage requires every AC to have a result", async (t) => {
  const featureDir = await fixture(t);
  await writeFile(path.join(featureDir, "plan.md"), plan);
  await writeFile(path.join(featureDir, "review.md"), review);
  const withoutManual = acceptance.replace(/\| AC-2[^\n]+\n/, "").replace("结论：PENDING", "结论：PASS");
  await writeFile(path.join(featureDir, "acceptance.md"), withoutManual);

  const result = run(featureDir, "accept");
  const report = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.ok(report.issues.some((issue) => issue.code === "UNCOVERED_AC" && issue.message.includes("AC-2")));
});
