# spec-flow 主流程详解

设计目标：让 AI 全程驱动开发，人只在关键节点把关。每个环节有明确的「产出物」和「停止条件」，防止 AI 一口气冲到底。

## 总入口与工作区

`/spec-flow-go` 是可选总入口：新需求按决策树分流，已有需求按工作区状态续接；明确点名 `/analyze`、`/patch`、`/review` 等技能时仍可精准直达。

全流程产物写入 `.spec-flow-workspace/<feature>/`，包含 `spec.md`、`plan.md`、`review.md`、`acceptance.md`。同一 feature 使用同一组 `AC-N` 编号，依次连接 Spec、Task、测试与验收证据。`/patch` 不强制落盘。

各阶段使用对应校验：

```bash
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage spec
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage plan
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage review
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage accept
```

## 环节职责

### 1. /analyze 需求分析
- 复述需求：输入、输出、触发条件。
- 口径逐条标注证据等级：【文档】/【推断】/【实测】。
- 需求没提的关联点只记录不动，列入待确认。
- 产出：需求理解 + 待确认问题清单。
- 停止条件：待确认问题清空（用户逐条回复或确认无异议）。

### 2. /spec PRD
- 按 spec-flow-spec 随附的 references/spec-template.md 产出到 `.spec-flow-workspace/<feature>/spec.md`。
- 业务口径必须带来源；验收标准使用唯一 AC 编号，可验证且含精确预期值。
- 影响面里明确列出「不改动的东西」。
- 停止条件：spec 结构校验通过，用户明确确认后将状态改为 `spec-confirmed`。

### 3. /plan 技术方案
- 按 spec-flow-plan 随附的 references/plan-template.md 产出到同目录 `plan.md`。
- 技术选型首要标准：AI 能否全程驱动。
- 改动最小化检查：需求未提及的关联点是否保持原样。
- 任务拆解为垂直切片，每个 Task 有依据、文件、步骤、验证方式和关联 AC；所有 AC 均有 Task 覆盖。
- 跨产物语义审查：Task 行为真正满足 AC，验证能证明 AC，且不引入 Spec 外功能或违反不改动范围。
- 停止条件：语义审查、plan 结构与 AC 映射校验通过，用户确认后才允许写代码。

### 4. /build 增量实现
- 按确认过的任务顺序，一次一个垂直切片。
- 接口未就绪：不写 mock，用 dev 内联假数据（符合业务公式；路径造不出时加 localhost 后门）。
- 每片完成即自测，不等全部写完。
- 遵守 house-rules 全部约定。

### 5. /test TDD
- 红：先写一个会失败的测试。
- 绿：最小改动让它通过。
- 重构：清理重复与坏味道，保持绿。
- 核心口径（金额、状态流转、权限）必须有测试。

### 6. /review AI 审查
- 对照 spec-flow-review 随附的五维清单，全流程报告写入 `review.md`。
- 发现问题就地修复并说明根因；有分歧的列入待裁决项等用户决定。
- 结论分为 PASS / PENDING / REJECT；阻断项未处理不得 PASS，豁免必须留痕。
- 禁止为过审而弱化测试。

### 7. /accept 验收
- 自动验证优先：当前环境能执行的测试、CLI、集成、文件解析等验证全部由代理实际跑完，禁止转交用户。
- 全流程报告写入 `acceptance.md`，每条 AC 都有自动或手动结果、实际结果与证据，不允许漏项。
- 记录最后改动标识，最后改动之后重跑受影响验证；旧通过结果不能证明当前版本。
- 只有确实无法自动化的事项才输出「手动验证步骤清单」：每个步骤写清操作、入口/URL、精确预期值；缺口清单一并交付。
- 全部自动 PASS 且无人工项为 PASS；有 FAIL 为 FAIL；有人工待反馈项为 PENDING。
- UI 类改动禁止代理自行开浏览器/启服务验证——用户环境已有服务在跑，这类人工项直接给步骤让用户手动执行并反馈。
- FAIL 按根因回到 analyze / plan / build / test，不一律重回需求分析。

### 8. /ship 发版
- commit message 用中文，说清为什么改。
- push 前必须先 pull 对应远端分支（避免 non-fast-forward 被拒或覆盖他人提交）。
- 附改动清单与遗留缺口，不隐瞒未完成项。

### /patch Vibe 补丁通道
- 适用：文案、样式微调、明显小 bug、命名/日志等单点小改。
- 文案/样式：直接改 → 快审 → 验证清单。
- Bug：先复现并定位根因，准备原失败场景的回归验证，再最小修复；防重/时序问题必须核查 await 边界。
- 根因不明、涉及核心口径或改动扩大时升级全流程，不拿猜测充当确定修复。

## 全局红线（任何环节都适用）

1. 推断必须先告知，禁止静默写入。
2. 需求没提的不改，共享配置加东西限定单据类型。
3. 文档已写明的直接照做不标疑；文档没写的才推断标疑。
4. 断言「点不了/不会重复」前，先核查校验链与网络请求窗口（await 边界）。
5. 浏览器验证、启动服务一律交给用户手动做。
