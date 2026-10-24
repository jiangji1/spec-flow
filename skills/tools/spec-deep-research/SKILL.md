---
name: spec-deep-research
description: 对技术选型、产品、学术或行业主题执行可断点续传的深度调研。Use when 用户需要多对象、多字段、多轮联网检索并产出带来源的结构化结果和 report.md，而不是一次简单问答。
---

# 深度调研

按「确认大纲 → 分批调研 → 校验结果 → 汇总报告」执行。`<skill-dir>` 指当前 `SKILL.md` 所在目录。

来源：基于 https://github.com/Weizhena/deep-research-skills 的中文流程适配，固定版本 `6ce38f60e3f8b22502c29873f96503a4e0c5addb`，MIT；校验脚本保留上游实现。

## 1. 确认调研大纲

1. 明确主题、目标、时间范围、调研对象 items、字段 fields 和输出目录；仅在无法从需求确定时提问。
2. 默认输出到当前工作目录下的 `<topic-slug>/`，结果目录默认为 `results/`。
3. 先展示对象、字段、时间范围、批次大小和每批对象数，用户确认后再开始长时间检索。
4. 将确认结果写入 `outline.yaml` 和 `fields.yaml`。字段格式必须与校验器一致：

```yaml
fields:
  基本信息:
    - name: release_date
      description: 首次发布日期
      detail_level: 简要
uncertain: []
```

`outline.yaml` 保存 `topic`、`items` 和 `execution`，其中 `execution` 包含 `batch_size`、`items_per_agent`、`output_dir`。需要补充对象或字段时，先展示变更并获得确认，再更新大纲。

## 2. 分批检索

1. 按大纲分批处理；相互独立的对象可并行检索，不重复搜索同一对象。
2. 每个对象写入 `results/<item-slug>.json`，已完成的文件跳过，实现断点续传。
3. 按 `fields.yaml` 覆盖字段，最终字段值使用用户语言；检索可使用其他语言。
4. 关键事实必须有可访问的来源。每个结果增加 `_sources`，保存来源标题和 URL；报告中引用这些来源。
5. 查不到或来源冲突的字段标为 `[不确定]`，并把字段名加入 `uncertain` 数组。禁止编造，不用模型记忆冒充实时检索结果。
6. 同一失败查询不重复发起；记录失败原因并换用不同来源或关键词。每批完成后汇报进度，按已确认的批次配置继续。

## 3. 校验结构化结果

校验器需要 Python 3 和 PyYAML。缺少依赖时说明安装命令，经用户确认后再安装。

对每个结果实际运行：

```bash
python <skill-dir>/scripts/validate_json.py --fields <topic-slug>/fields.yaml --json <topic-slug>/results/<item-slug>.json
```

缺少必填字段时补齐或明确标记不确定后重跑。脚本提示「未找到 JSON 文件」不算验证通过；零结果不能进入报告阶段。

## 4. 汇总报告

生成 `<topic-slug>/report.md`：

- 覆盖大纲中的全部对象和字段，并保留对象间的可比维度。
- 给关键结论和事实附来源链接，区分来源原文与自己的分析。
- 不确定字段、失败对象和未覆盖范围单独列出，不能静默省略。
- 报告末尾附完成数量、校验结果和来源清单。

## 停止条件

全部对象处理完成、每个 JSON 均通过必填字段校验、`report.md` 已生成，且不确定项与失败项已交付。
