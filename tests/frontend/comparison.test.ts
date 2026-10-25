import test from "node:test";
import assert from "node:assert/strict";
import { compatibleExperiments } from "../../apps/web/src/lib/workspace.ts";
import type { Experiment } from "../../apps/web/src/lib/api.ts";
const run = (overrides: Partial<Experiment> = {}): Experiment => ({
  id: "run-a",
  module: "production",
  model: "xgboost",
  dataset_version_id: "data-v1",
  config: { component: "CMP-001", horizon: 14 },
  metrics: { mae: 7.3 },
  provenance: { dataset_checksum: "sha256-fixture" },
  duration_seconds: 1,
  created_at: "2026-10-25T00:00:00Z",
  mlflow_run_id: null,
  ...overrides,
});
test("same dataset, component and holdout horizon permit baseline comparison", () =>
  assert.equal(
    compatibleExperiments([
      run(),
      run({ id: "run-b", model: "seasonal_naive" }),
    ]),
    true,
  ));
test("different components, horizons and dataset checksums are blocked", () => {
  for (const b of [
    run({ config: { component: "CMP-002", horizon: 14 } }),
    run({ config: { component: "CMP-001", horizon: 30 } }),
    run({ provenance: { dataset_checksum: "other" } }),
    run({ dataset_version_id: "data-v2" }),
  ])
    assert.equal(compatibleExperiments([run(), b]), false);
});
test("missing provenance and singleton selections cannot establish comparability", () => {
  assert.equal(compatibleExperiments([run()]), false);
  assert.equal(
    compatibleExperiments([run({ provenance: {} }), run({ provenance: {} })]),
    false,
  );
});
test("knowledge and vision require an explicit shared evaluation protocol", () => {
  assert.equal(
    compatibleExperiments([
      run({ module: "knowledge" }),
      run({ module: "knowledge" }),
    ]),
    false,
  );
  const a = run({
    module: "vision",
    config: { evaluation_protocol: "heldout-v1" },
  });
  assert.equal(compatibleExperiments([a, { ...a, id: "run-b" }]), true);
  assert.equal(
    compatibleExperiments([
      a,
      { ...a, config: { evaluation_protocol: "other" } },
    ]),
    false,
  );
});
