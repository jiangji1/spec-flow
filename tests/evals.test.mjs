import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const routes = new Set(["patch", "analyze", "resume", "accept", "plan", "review", "answer"]);
const workspaceModes = new Set(["required", "not-required", "none"]);

test("behavior evaluation scenarios are complete, unique, and actionable", async () => {
  const document = JSON.parse(await readFile(path.join(repoRoot, "evals", "scenarios.json"), "utf8"));
  assert.equal(document.version, 1);
  assert.ok(document.scenarios.length >= 12);

  const ids = new Set();
  for (const scenario of document.scenarios) {
    assert.match(scenario.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(ids.has(scenario.id), false, `duplicate scenario: ${scenario.id}`);
    ids.add(scenario.id);
    assert.ok(scenario.input.length > 0, `${scenario.id} needs input`);
    assert.equal(typeof scenario.setup, "object");
    assert.ok(routes.has(scenario.expect.route), `${scenario.id} has a valid route`);
    assert.ok(Array.isArray(scenario.expect.requiredBehaviors));
    assert.ok(scenario.expect.requiredBehaviors.length > 0, `${scenario.id} needs required behaviors`);
    assert.ok(Array.isArray(scenario.expect.forbidden));
    assert.ok(scenario.expect.forbidden.length > 0, `${scenario.id} needs forbidden behaviors`);
    if (scenario.expect.workspace) assert.ok(workspaceModes.has(scenario.expect.workspace));
    if ("mustAsk" in scenario.expect) assert.equal(typeof scenario.expect.mustAsk, "boolean");
    if (scenario.expect.conclusion) assert.ok(["PASS", "PENDING", "FAIL", "REJECT"].includes(scenario.expect.conclusion));
  }

  for (const requiredId of [
    "route-copy-patch",
    "route-shared-config-full",
    "resume-spec-draft",
    "accept-manual-is-pending",
    "accept-stale-evidence",
    "patch-bug-root-cause",
    "plan-semantic-ac-check",
  ]) {
    assert.ok(ids.has(requiredId), `missing required scenario: ${requiredId}`);
  }
});
