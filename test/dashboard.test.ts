import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = JSON.parse(readFileSync(new URL("../dashboard.json", import.meta.url), "utf8"));
const panels: any[] = dashboard.panels.flatMap((p: any) => [p, ...(p.panels ?? [])]);

test("tables and pie charts use instant queries", () => {
  const targets = panels.filter((p) => p.type === "table" || p.type === "piechart").flatMap((p) => p.targets);
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.equal(target.instant, true, target.expr);
    assert.equal(target.range, false, target.expr);
  }
});

test("rate windows follow the graph resolution", () => {
  for (const target of panels.flatMap((p) => p.targets ?? [])) {
    assert.doesNotMatch(target.expr, /\[1m\]/);
  }
});

test("dashboard only uses metrics the exporter has", async () => {
  const { register } = await import("../src/metrics.ts");
  const known = new Set((await register.getMetricsAsJSON()).map((m) => m.name));
  const used = JSON.stringify(dashboard).match(/adguard_[a-z_]+/g)!;
  for (const name of used) assert.ok(known.has(name), name);
});
