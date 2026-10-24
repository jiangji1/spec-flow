---
name: spec-conventions
description: spec-flow 通用编码约定。Use when 写前端代码、实现下载、配置热键、启动独立进程等场景。
---

# spec-flow 编码约定

写代码时全程生效的硬约定，来源是实际踩坑记录。

## 文件下载

- 不用 `window.open` 实现下载。
- 直链文件：`<a href={downloadUrl} download>` 标签。
- 生成内容：`<a>` + Blob URL 或 `downloadBlob`。

## 全局热键

- 不用裸 Esc 做退出/关闭（误触代价大）；改用组合键（如 Ctrl+Shift+X），并写日志。

## 独立启动进程

- Windows 上独立启动 Python 脚本用 `Start-Process`（cmd `start` 会失败并弹报错框）。

## 其他

- 用户只用 AI 开发：所有产出必须是纯代码/纯文本，AI 能读能改；需要人工 GUI 操作的步骤单独列出。
- 服务和浏览器一律由用户手动操作，代理不启服务、不开浏览器。
