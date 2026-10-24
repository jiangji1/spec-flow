# spec-flow

面向「只用 AI 开发」的工作流工具包：**spec 主流程 + AI Code Review + Vibe 补丁**。

人只出现在两个点：**确认方案** 和 **手动验收**，中间全程 AI 驱动。

## npm 全局安装

```bash
npm install -g spec-flow
```

全局安装时自动注册 16 个技能到四个 Agent；已有同名技能会先检查，未修改过的旧版本可安全升级，本地修改默认冲突中止且所有目标均不写文件。

| Agent | 用户技能目录 |
|---|---|
| Qoder | `~/.qoder/skills` |
| Codex | `~/.agents/skills` |
| Claude Code | `~/.claude/skills` |
| Cursor | `~/.cursor/skills` |

安装后在 Agent 中使用 `/spec-flow-go`。若技能未立即出现，重启对应 Agent 后再试。若 npm 阻止或提示 postinstall 生命周期脚本，可显式使用 `npm install -g spec-flow --allow-scripts=spec-flow`；该脚本只负责上述四个技能目录的注册与冲突检查。

```bash
spec-flow --version
spec-flow doctor --target all --strict
spec-flow register                 # 手动重新注册到四个 Agent
spec-flow install --target all     # 只预览，不写文件
spec-flow validate .spec-flow-workspace/<feature> --stage accept
```

升级使用 `npm install -g spec-flow@latest`。如需用新源替换本地修改，`spec-flow install --target all --apply --force` 会先备份冲突技能。包采用 [MIT License](LICENSE)。

## 主流程

```
需求进来
 │
 ├─ /spec-flow-go  可选总入口：分流新需求、续接已有 feature
 │
 ├─【重】核心逻辑 / 权限 / 资金 / 业务口径 ──→ 全流程：
 │
 │   /analyze   需求分析    澄清口径；推断标注证据等级，不确定先问
 │   /spec      PRD        业务口径 + 验收标准，人确认后再动
 │   /plan      技术方案    影响面 + 改动最小化检查 + 任务拆解，人确认后再写码
 │   /build     增量实现    垂直切片；不 mock，用 dev 内联假数据
 │   /test      TDD        红-绿-重构
 │   /review    AI 审查     五维清单：正确性/安全/性能/可维护/测试覆盖
 │   /accept    验收        自验全部可自动项；仅人工项给精确步骤
 │   /ship      发版        中文 commit、先 pull 后 push、附缺口清单
 │
 └─【轻】文案 / 样式 / 小 bug ──→ Vibe 补丁通道：

     /patch     小改直接改；Bug 先定位根因，再快审与验证
```

判定标准见 [decision-tree.md](skills/flow/go/references/decision-tree.md)，流程详解见 [docs/workflow.md](docs/workflow.md)。

## 需求工作区与追踪

全流程产物统一放在目标项目的 `.spec-flow-workspace/<feature>/`，技能安装升级不触碰该目录：

```text
.spec-flow-workspace/<feature>/
├── spec.md         # AC-N 验收标准与来源
├── plan.md         # Task → AC/TEST 映射
├── review.md       # PASS / PENDING / REJECT
└── acceptance.md   # AC 全覆盖、实际证据与最终结论
```

`/patch` 不强制创建这些文档。完整流程通过相同 `feature` 和 `AC-N` 串起需求、任务、测试、评审与验收，可按 frontmatter 状态续接。

## 技能索引

### 流程技能（skills/flow/）

| 技能 | 作用 | 何时停 |
|---|---|---|
| spec-flow-go | 新需求分流、已有 feature 续接 | 路由明确；高风险选择先确认 |
| spec-flow-analyze | 需求分析、口径澄清、证据分级 | 待确认问题清空 |
| spec-flow-spec | 产出 PRD | 人确认 spec |
| spec-flow-plan | 技术方案 + 任务拆解 | 人确认方案 |
| spec-flow-build | 垂直切片增量实现 | 每片可独立验证 |
| spec-flow-test | TDD 红-绿-重构 | 绿 + 无重复用例 |
| spec-flow-review | 五维代码审查 | 清单全过或问题闭环 |
| spec-flow-accept | 自动验收 + 仅人工项验证步骤 | 可验项通过；有人工项才等反馈 |
| spec-flow-ship | 提交发版 | commit 完成、push 成功 |
| spec-flow-patch | 轻量补丁通道 | 验证清单交付 |

### 纪律规则（skills/house-rules/）

| 技能 | 内容 |
|---|---|
| spec-conventions | 下载用 a 标签、热键规范、独立进程等编码约定 |
| spec-scope-discipline | 改动最小化、口径先问、需求没提的不动 |
| spec-evidence-rules | 推断标注证据等级、文档即权威、await 边界核查 |

### 工具技能（skills/tools/）

| 技能 | 作用 | 依赖与来源 |
|---|---|---|
| spec-docx | 创建、读取、检查和编辑 Word 文档 | 独立实现；优先使用项目现有文档库 |
| spec-deep-research | 确认大纲、分批检索、字段校验和带来源报告 | Python 3 + PyYAML；基于 [MIT 上游](https://github.com/Weizhena/deep-research-skills)适配 |
| spec-anydesign | 从截图、网站或 Figma 提取设计规范和单元素复刻提示 | 部分脚本需 Playwright / Pillow；基于 [MIT 上游](https://github.com/uxKero/anydesign)适配 |

精选结论：官方 docx 技能许可证不允许复制或衍生，因此只独立实现通用工作流，不搬运其内容；另外两个技能固定上游版本并保留 `LICENSE`。浏览器自动化、依赖安装和第三方导出均需遵守当前环境约束并获得确认。

### 运行资源（随各技能分发）

- [spec-template.md](skills/flow/spec/references/spec-template.md) — PRD 模板
- [plan-template.md](skills/flow/plan/references/plan-template.md) — 技术方案与跨产物一致性模板
- [review-checklist.md](skills/flow/review/references/review-checklist.md) — 五维审查清单
- [review-template.md](skills/flow/review/references/review-template.md) — 三态结论、阻断项与豁免记录
- [acceptance-template.md](skills/flow/accept/references/acceptance-template.md) — AC 覆盖、最终改动后的证据与结论
- [decision-tree.md](skills/flow/go/references/decision-tree.md) — go 的轻重分流判定

技能运行时不依赖目标项目存在根目录 `templates/` 或 `docs/`；所需 references/scripts 均随技能安装。

## 接入方式

技能均为 Agent Skills 标准格式（SKILL.md）。使用零依赖 Node.js 脚本同步，默认只预览、不写文件：

```bash
# 预览安装到 Qoder 用户技能目录
node scripts/install.mjs

# 预览安装到 Claude Code
node scripts/install.mjs --target claude

# 预览安装到 Qoder / Codex / Claude Code / Cursor
node scripts/install.mjs --target all

# 只同步流程技能、纪律技能或工具技能
node scripts/install.mjs --group flow
node scripts/install.mjs --group house-rules
node scripts/install.mjs --group tools

# 确认计划后才实际写入
node scripts/install.mjs --apply

# 自定义目标目录
node scripts/install.mjs --dest /path/to/skills --apply
```

安装目录中的 `.spec-flow-manifest.json` 记录上次安装版本与文件哈希：目标与旧清单一致时标记为安全 `update`，与旧清单也不一致时视为本地修改并默认整体中止；`--force` 会先备份冲突技能再替换。

只读体检不会修改任何文件：

```bash
# 检查默认 Qoder 技能目录
node scripts/doctor.mjs

# JSON 输出；将未安装或内容漂移也视为失败
node scripts/doctor.mjs --strict --json

# 检查自定义安装目录
node scripts/doctor.mjs --dest /path/to/skills
```

## 行为场景评测

`evals/scenarios.json` 提供 13 个固定场景，覆盖轻重分流、根因定位、续接、评审阻断、语义 AC 检查、人工验收和证据新鲜度。回放方法与通过标准见 [docs/evals.md](docs/evals.md)。

Node 测试验证场景结构；真实 Agent 行为必须另行回放，不能用 Node 全绿代替。

## 产物校验

```bash
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage spec
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage plan
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage review
node scripts/validate.mjs .spec-flow-workspace/<feature> --stage accept
```

校验器检查必需章节、frontmatter、Task 完整性、AC 引用与覆盖、关联文件、验收证据和结论一致性；业务语义仍由 AI 与用户判断。加 `--json` 可输出结构化结果。验证器同时随 `spec-flow-go` 安装到 `<skill-dir>/scripts/validate.mjs`，目标项目无需复制本仓库脚本。

## 验证

```bash
node --test tests/install.test.mjs tests/skills.test.mjs tests/validate.test.mjs tests/doctor.test.mjs tests/evals.test.mjs
```

预期：22 个测试全部通过，0 失败。所有测试只写系统临时目录，不修改真实 Agent 技能目录；另校验技能元数据、本地资源、Python 语法、deep-research 字段、产物追踪和 doctor 漂移检测。

## 路线图

- [x] M1 骨架 + 9 个流程技能
- [x] M2 纪律规则技能 + 模板
- [x] M3 工具技能精选（spec-docx / spec-deep-research / spec-anydesign）
- [x] M4 install 脚本 + 真实项目试用一轮
- [x] M5 工作区追踪 + 总入口 + 产物校验 + doctor
- [x] M6 资源随技能打包 + 行为场景基线 + 语义审查 + Bug 根因链
- [x] M7 npm CLI + 四端自动注册 + 哈希清单安全升级 + 隔离全局安装验证
