---
name: spec-flow-ship
description: 开发流程第 8 步：提交发版。Use when 验收通过后准备 commit 与 push。
---

# 发版 /ship

验收通过后收尾：提交、推送、交代清楚。全流程必须先确认 `.spec-flow-workspace/<feature>/acceptance.md` 结论为 PASS；PENDING 或 FAIL 不得当作验收通过。

## 要做的事

1. **commit message 用中文**：说清为什么改，不只罗列改了什么；一个 commit 一个意图，不混杂无关改动。
2. **push 前必须先 pull**：先拉取对应远端分支再推，避免 non-fast-forward 被拒或覆盖他人提交。
3. **交付说明**附在回复里：
   - 改动清单（文件/模块级）
   - 遗留缺口与临时后门（含删除条件）
   - 用户需要注意的兼容性影响

## 顺序

```
git pull <远端> <分支>
git add <本次相关文件>     # 按文件名加，不用 git add -A
git commit
git push
```

## 红线

- 禁止把临时后门、调试代码、本地配置提交上去。
- .env、凭证类文件禁止入库，发现疑似敏感文件先停下问用户。
- push 被拒时先诊断远端状态，禁止 --force 除非用户明确要求。
