# spec-flow 行为场景评测

`evals/scenarios.json` 是路由、停止条件和证据行为的固定基线。它验证的是 AI 在真实 Agent 中的行为，不是文件结构，也不等同于 LLM 自动评分。

## 回放方式

1. 每个场景使用新的 Agent 会话，避免上一场景的上下文污染。
2. 输入场景 `input`，只补充 `setup` 明确给出的物料；缺失信息不能由执行者自行编造。
3. 本轮只观察路由、追问、停止条件和拟执行动作，不真正修改业务代码或覆盖工作区。
4. 逐项核对 `expect.requiredBehaviors` 与 `expect.forbidden`，记录实际证据。
5. 任一 forbidden 命中即 FAIL；requiredBehaviors 未全部满足也判 FAIL，不用主观总分抵消。

## 结果记录

| 字段 | 内容 |
|---|---|
| scenario | 场景 ID |
| agent / 日期 | 实际回放环境与日期 |
| result | PASS / FAIL |
| evidence | 实际路由、追问或停止行为摘要 |
| regression | 失败后对应修改与需要的复测场景 |

## 通过标准

- 全量场景在目标 Agent 回放，不能只挑容易通过的用例。
- 修改 go、analyze、plan、review、accept、patch 后，至少回放受影响场景及全部路由场景。
- 自动 Node 测试与 Agent 行为评测分别报告；Node 全绿不能替代行为评测，未回放时必须明确写「未执行 Agent 行为回放」。
