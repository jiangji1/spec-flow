#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const commands = {
  install: "install.mjs",
  register: "install.mjs",
  doctor: "doctor.mjs",
  validate: "validate.mjs",
};
const usage = `spec-flow <command> [options]

Commands:
  install   预览或安装 Agent 技能；使用 --target all --apply 安装到全部 Agent
  register  等价于 install --target all --apply
  doctor    只读检查技能、资源与更新状态
  validate  校验 .spec-flow-workspace/<feature> 产物
  --version 输出包版本`;

const [command, ...args] = process.argv.slice(2);
if (!command || command === "--help" || command === "-h" || command === "help") {
  console.log(usage);
  process.exit(0);
}
if (command === "--version" || command === "-v" || command === "version") {
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  console.log(packageJson.version);
  process.exit(0);
}
const script = commands[command];
if (!script) {
  console.error(`Unknown command: ${command}`);
  console.error(usage);
  process.exit(1);
}
const commandArgs = command === "register" ? ["--target", "all", "--apply", ...args] : args;
const result = spawnSync(process.execPath, [path.join(packageRoot, "scripts", script), ...commandArgs], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
