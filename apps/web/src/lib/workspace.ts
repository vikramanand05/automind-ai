import type { Experiment } from "./api";
export function compatibleExperiments(runs: Experiment[]) {
  return (
    runs.length > 1 &&
    runs.every(
      (e) =>
        typeof e.provenance.dataset_checksum === "string" &&
        e.provenance.dataset_checksum.length > 0 &&
        e.module === runs[0].module &&
        e.dataset_version_id === runs[0].dataset_version_id &&
        e.provenance.dataset_checksum === runs[0].provenance.dataset_checksum &&
        (e.module === "production"
          ? e.config.component === runs[0].config.component &&
            e.config.horizon === runs[0].config.horizon
          : e.config.evaluation_protocol != null &&
            e.config.evaluation_protocol ===
              runs[0].config.evaluation_protocol),
    )
  );
}
export function metricValue(run: Experiment) {
  return run.metrics.mae != null
    ? `MAE ${run.metrics.mae.toFixed(3)}`
    : run.metrics.accuracy != null
      ? `${(run.metrics.accuracy * 100).toFixed(1)}% accuracy`
      : "View metrics";
}
