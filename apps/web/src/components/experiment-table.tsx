"use client";
import { useState } from "react";
import { ArrowDownUp, ChevronRight, FlaskConical } from "lucide-react";
import type { Experiment } from "@/lib/api";
import { metricValue } from "@/lib/workspace";
import { Badge, date } from "./ui/workspace";
export function ExperimentTable({
  data,
  onInspect,
  selected,
  onSelect,
}: {
  data: Experiment[];
  onInspect?: (run: Experiment) => void;
  selected?: string[];
  onSelect?: (id: string) => void;
}) {
  const [sort, setSort] = useState("created_at");
  const [asc, setAsc] = useState(false);
  const rows = [...data].sort((a, b) => {
    let result = 0;
    if (sort === "metric") {
      const av = a.metrics.mae ?? a.metrics.accuracy,
        bv = b.metrics.mae ?? b.metrics.accuracy;
      result = (av ?? Infinity) - (bv ?? Infinity);
    } else
      result = String(
        a[sort as "model" | "module" | "created_at"],
      ).localeCompare(String(b[sort as "model" | "module" | "created_at"]));
    return asc ? result : -result;
  });
  const heading = (key: string, name: string) => (
    <th aria-sort={sort === key ? (asc ? "ascending" : "descending") : "none"}>
      <button
        onClick={() => {
          setSort(key);
          setAsc(sort === key ? !asc : true);
        }}
      >
        {name}
        <ArrowDownUp size={10} />
      </button>
    </th>
  );
  return (
    <div className="table-wrap">
      <table aria-label="Recorded experiments">
        <thead>
          <tr>
            {onSelect && (
              <th>
                <span className="sr-only">Compare</span>
              </th>
            )}
            {heading("model", "Model / experiment")}
            {heading("module", "Module")}
            <th>Dataset version</th>
            {heading("metric", "Measured result")}
            <th>Tracking</th>
            {heading("created_at", "Created")}
            {onInspect && (
              <th>
                <span className="sr-only">Details</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((exp) => (
            <tr key={exp.id}>
              {onSelect && (
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Compare ${exp.model} ${exp.id.slice(0, 8)}`}
                    checked={selected?.includes(exp.id) || false}
                    onChange={() => onSelect(exp.id)}
                  />
                </td>
              )}
              <td>
                <button
                  className="table-action"
                  disabled={!onInspect}
                  onClick={() => onInspect?.(exp)}
                >
                  <div className="table-model">
                    <div>
                      <FlaskConical size={14} />
                    </div>
                    <span>
                      <strong>{exp.model}</strong>
                      <small>{exp.id.slice(0, 8)}</small>
                    </span>
                  </div>
                </button>
              </td>
              <td>
                <Badge>{exp.module}</Badge>
              </td>
              <td>
                <code>
                  {exp.dataset_version_id?.slice(0, 8) || "See provenance"}
                </code>
              </td>
              <td className="mono" style={{ fontSize: 11 }}>
                {metricValue(exp)}
              </td>
              <td>
                <span className="small-text muted">
                  {exp.mlflow_run_id ? "MLflow + local" : "Local record"}
                </span>
              </td>
              <td className="muted" style={{ fontSize: 10 }}>
                {date(exp.created_at)}
              </td>
              {onInspect && (
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Inspect experiment ${exp.id.slice(0, 8)}`}
                    onClick={() => onInspect(exp)}
                  >
                    <ChevronRight size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
