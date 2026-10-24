---
name: spec-flow-spec
description: 开发流程第 2 步：写 PRD。Use when 需求分析确认后、写代码前，产出业务口径与验收标准文档。
---

# 撰写 PRD /spec

基于确认过的需求分析，按 <skill-dir>/references/spec-template.md 产出 `.spec-flow-workspace/<feature>/spec.md`。

## 要做的事

1. **元信息**：填写 `feature`、`status: draft`、`source`，同一需求后续产物共用 feature。
2. **背景与目标**：为什么做、解决什么问题，两三句说清。
3. **业务口径**：逐条列出，每条带来源标注（【文档】/【推断，待确认】）。文档已写明的不标疑；文档没写的按推断标注等确认。
4. **验收标准**：使用唯一 `AC-N` 编号和可验证的精确预期值（数字、文案、状态）。写不出预期值的标准不算合格。
5. **影响面与不改动范围**：涉及模块/文件/接口，并明确列出「不改动的东西」。
6. **待确认问题**：以表格列出问题、当前假设、需要谁确认。
7. **结构校验**：通过 spec-flow-go 随附的验证器执行 `--stage spec`；在 spec-flow 仓库也可运行 `node scripts/validate.mjs .spec-flow-workspace/<feature> --stage spec`。未实际执行成功时不得声称机器校验通过。

## 停止条件

用户明确确认 spec 后才把 `status` 改为 `spec-confirmed` 并进入 /plan。确认前禁止写任何业务代码。

## 红线

- 口径类内容必须先有方案确认，不能边写边定。
- 禁止把推断包装成定论写进口径。
