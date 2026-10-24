---
name: spec-flow-go
description: spec-flow 总入口。Use when 用户提出开发需求、小修、评审、验收或「接着上次」，需要先分流或续接现有工作区时。
---

# spec-flow 总入口 /go

只负责识别意图、检查已有产物并路由到现有技能，不另建一套流程。用户明确点名某个技能时直接执行对应技能。

## 1. 新需求分流

完整判定使用 <skill-dir>/references/decision-tree.md。

- 核心业务逻辑、权限、资金、业务口径、共享组件或配置、跨模块、接口契约变化：从 `/analyze` 进入全流程。
- 文案、样式、明显小 bug 等单点修改，且不碰上述范围、容易回滚：进入 `/patch`。
- 拿不准：从 `/analyze` 开始，宁重勿轻。
- 纯查询或方案讨论：直接回答，不创建工作区。
- 明确只要评审或验收：分别进入 `/review` 或 `/accept`，不强制重跑全流程。

路由后告诉用户选择了哪条通道及理由。存在多条合理路径或高风险假设时先等用户选择，不静默猜测。

## 2. 续接现有需求

用户说「接着上次」或指定 feature 时，只读扫描当前项目 `.spec-flow-workspace/<feature>/`。有多个进行中 feature 且用户未指定时列出候选，不默认选第一个。

按产物与 frontmatter 状态判断下一步：

| 当前状态 | 下一步 |
|---|---|
| 没有 Spec | `/analyze` → `/spec` |
| `spec.md` 为 `draft` | 展示待确认项，等用户确认 |
| Spec 已确认且没有 Plan | `/plan` |
| `plan.md` 为 `draft` | 展示方案，等用户确认 |
| Plan 已确认但实现未完成 | `/build` → `/test` |
| 实现完成且没有通过的 Review | `/review` |
| Review 为 PENDING / REJECT | 先处理待裁决项或阻断项 |
| Review PASS 且验收未 PASS | `/accept` |
| Acceptance 为 PENDING | 只等待对应人工验证反馈，不重跑自动通过项 |
| Acceptance FAIL | 按失败根因回 `/analyze`、`/plan`、`/build` 或 `/test`，不一律重回起点 |
| Acceptance PASS | `/ship` |

## 3. 阶段校验

进入相应阶段前运行：

```bash
node <skill-dir>/scripts/validate.mjs .spec-flow-workspace/<feature> --stage spec
node <skill-dir>/scripts/validate.mjs .spec-flow-workspace/<feature> --stage plan
node <skill-dir>/scripts/validate.mjs .spec-flow-workspace/<feature> --stage review
node <skill-dir>/scripts/validate.mjs .spec-flow-workspace/<feature> --stage accept
```

验证器随本技能安装，目标项目无需复制仓库脚本。若资源缺失，先运行 doctor 检查安装；未实际执行成功时不得声称机器校验已通过。

## 红线

- 不因为续接而覆盖已有产物或确认状态。
- 不凭文件名猜测业务结论；读不到状态时明确标记并询问。
- `/patch` 不强制创建 Spec、Plan、Review 或 Acceptance 文档。
