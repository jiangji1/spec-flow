import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.npm_config_global !== "true") {
  console.log("spec-flow: local install detected; skip Agent registration. Run spec-flow register when needed.");
} else {
  const script = fileURLToPath(new URL("./install.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--target", "all", "--apply"], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("spec-flow: Agent registration failed; no target was modified after a conflict was detected.");
    console.error("Review the conflicts, then run spec-flow install --target all --apply (or --force to back up local edits).");
    process.exit(result.status ?? 1);
  }
  console.log("spec-flow: registered Qoder, Codex, Claude Code and Cursor skills.");
}
