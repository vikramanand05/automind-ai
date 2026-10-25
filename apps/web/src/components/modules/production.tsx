"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Box,
  Database,
  FlaskConical,
  Gauge,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LoadingSkeleton,
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  Metric,
  InsightPanel,
  format,
} from "@/components/ui/workspace";
import { Chart } from "@/components/charts";
import {
  api,
  post,
  type Dataset,
  type Forecast,
  type Simulation,
} from "@/lib/api";
export default function Production() {
  const client = useQueryClient();
  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api<Dataset[]>("/production/datasets"),
  });
  const [selected, setSelected] = useState("");
  const [component, setComponent] = useState("");
  const [model, setModel] = useState("seasonal_naive");
  const [horizon, setHorizon] = useState(14);
  const dataset =
    datasets.data?.find((d) => d.id === selected) || datasets.data?.[0];
  const activeComponent = dataset?.components.includes(component)
    ? component
    : dataset?.components[0];
  const generate = useMutation({
    mutationFn: () =>
      post<Dataset>("/production/synthetic", {
        days: 240,
        components: 3,
        seed: 42,
      }),
    onSuccess: (d) => {
      setSelected(d.id);
      forecast.reset();
      simulate.reset();
      client.invalidateQueries({ queryKey: ["datasets"] });
      client.invalidateQueries({ queryKey: ["system"] });
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData();
      data.append("file", file);
      return api<Dataset>("/production/datasets", {
        method: "POST",
        body: data,
      });
    },
    onSuccess: (d) => {
      setSelected(d.id);
      forecast.reset();
      simulate.reset();
      client.invalidateQueries({ queryKey: ["datasets"] });
    },
  });
  const forecast = useMutation({
    mutationFn: () =>
      post<Forecast>("/production/forecast", {
        version_id: dataset?.id,
        component: activeComponent,
        model,
        horizon,
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["experiments"] });
      client.invalidateQueries({ queryKey: ["forecasts"] });
      client.invalidateQueries({ queryKey: ["system"] });
    },
  });
  const simulate = useMutation({
    mutationFn: () =>
      post<Simulation>("/production/simulate", {
        version_id: dataset?.id,
        component: activeComponent,
        seed: 42,
      }),
  });
  const result = forecast.data;
  if (datasets.isLoading) return <LoadingSkeleton rows={6} />;
  return (
    <>
      <section className="panel data-toolbar">
        <div>
          <h2>Production dataset</h2>
          <p className="muted">
            Daily component demand · validated, versioned and traceable
          </p>
        </div>
        <div className="button-row">
          <label className="btn btn-outline">
            <Upload size={15} />
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="sr-only"
              aria-label="Import production CSV"
              onChange={(e) => {
                if (e.target.files?.[0]) upload.mutate(e.target.files[0]);
              }}
            />
          </label>
          <Button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Plus size={15} />
            )}
            Generate synthetic data
          </Button>
        </div>
      </section>
      <ErrorNotice
        error={
          generate.error ||
          upload.error ||
          forecast.error ||
          simulate.error ||
          datasets.error
        }
      />
      {dataset ? (
        <>
          <div className="dataset-notice">
            <Database size={16} />
            <span>
              {dataset.name} · {dataset.rows.toLocaleString()} rows
            </span>
            <Badge tone={dataset.synthetic ? "amber" : "blue"}>
              {dataset.synthetic ? "Synthetic data" : "Uploaded data"}
            </Badge>
            <span className="muted">
              Seeded data is for demonstration and simulation.
            </span>
          </div>
          <section className="panel filters">
            <label>
              Dataset
              <select
                value={dataset.id}
                onChange={(e) => {
                  setSelected(e.target.value);
                  forecast.reset();
                  simulate.reset();
                }}
              >
                {datasets.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Component
              <select
                value={activeComponent}
                onChange={(e) => {
                  setComponent(e.target.value);
                  forecast.reset();
                  simulate.reset();
                }}
              >
                {dataset.components.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Forecast model
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  forecast.reset();
                }}
              >
                <option value="seasonal_naive">
                  Seasonal naive · baseline
                </option>
                <option value="xgboost">XGBoost</option>
                <option value="lstm">LSTM · optional PyTorch</option>
              </select>
            </label>
            <label>
              Horizon
              <select
                value={horizon}
                onChange={(e) => {
                  setHorizon(Number(e.target.value));
                  forecast.reset();
                }}
              >
                {[7, 14, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => forecast.mutate()}
              disabled={forecast.isPending || generate.isPending || upload.isPending}
            >
              {forecast.isPending ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <Activity size={15} />
              )}
              {forecast.isPending ? "Running forecast…" : "Run forecast"}
            </Button>
          </section>
          {result ? (
            <>
              <div className="metrics-grid">
                <Metric
                  label="Mean absolute error"
                  value={format(result.metrics.mae)}
                  detail="Rolling-origin holdout"
                  icon={Gauge}
                />
                <Metric
                  label="Root mean squared error"
                  value={format(result.metrics.rmse)}
                  detail="Three temporal folds"
                  icon={Activity}
                />
                <Metric
                  label="Weighted absolute error"
                  value={`${format(result.metrics.wape * 100)}%`}
                  detail="Forecast error / demand"
                  icon={FlaskConical}
                />
                <Metric
                  label="Forecast latency"
                  value={`${format(result.latency_ms)} ms`}
                  detail="Measured locally"
                  icon={Zap}
                />
              </div>
              <div className="two-columns">
                <section className="panel">
                  <SectionHead
                    title={`${result.component} · Demand outlook`}
                    action={<Badge tone="blue">{result.model}</Badge>}
                  />
                  <div className="chart-legend">
                    <span>
                      <i />
                      Actual
                    </span>
                    <span>
                      <i className="violet-dot" />
                      Forecast
                    </span>
                  </div>
                  <Chart data={[...result.history, ...result.forecast]} />
                  <p className="chart-note">
                    Forecasts use past observations. Error metrics use three
                    rolling origins with seven-day horizons. Shaded residual
                    bands are uncalibrated; they are not guaranteed coverage
                    intervals.
                  </p>
                </section>
                <section className="panel">
                  <SectionHead title="Inventory trend" />
                  <Chart data={result.history} inventory />
                  <p className="chart-note">
                    Recorded inventory levels in the selected dataset.
                  </p>
                </section>
              </div>
              <section className="panel">
                <SectionHead title="Held-out actual vs predicted" />
                <Chart data={result.backtest} />
              </section>
              {result.explanation.features && (
                <section className="panel">
                  <SectionHead
                    title="Forecast drivers"
                    action={<Badge>{result.explanation.method}</Badge>}
                  />
                  <div className="drivers">
                    {Object.entries(result.explanation.features).map(
                      ([k, v]) => (
                        <div key={k}>
                          <span>{k}</span>
                          <strong>{format(v, 4)}</strong>
                        </div>
                      ),
                    )}
                  </div>
                </section>
              )}
            </>
          ) : (
            <section className="panel">
              <Empty icon={Activity} title="Ready for your first forecast">
                Select a component and run a forecast. All metrics are computed
                from chronological holdouts.
              </Empty>
            </section>
          )}
          <section className="panel">
            <SectionHead
              title="Inventory planning simulation"
              action={
                <Button
                  variant="outline"
                  onClick={() => simulate.mutate()}
                  disabled={simulate.isPending || generate.isPending || upload.isPending}
                >
                  {simulate.isPending ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <FlaskConical size={15} />
                  )}
                  {simulate.isPending
                    ? "Simulating policy…"
                    : "Simulate inventory policy"}
                </Button>
              }
            />
            {simulate.data ? (
              <>
                <div className="table-wrap" style={{ marginBottom: 20 }}>
                  <table aria-label="Inventory intelligence">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Current inventory</th>
                        <th>Forecast demand</th>
                        <th>Lead time</th>
                        <th>Reorder point</th>
                        <th>Shortage risk</th>
                        <th>Recommended action</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="mono">{activeComponent}</td>
                        <td>
                          {format(simulate.data.current_inventory, 0)} units
                        </td>
                        <td>
                          {result
                            ? `${format(
                                result.forecast.reduce(
                                  (sum, p) => sum + (p.predicted || 0),
                                  0,
                                ),
                                0,
                              )} units / ${result.forecast.length} days`
                            : "Run forecast"}
                        </td>
                        <td>{simulate.data.assumptions.lead_time_days} days</td>
                        <td>{format(simulate.data.reorder_point)} units</td>
                        <td>
                          <Badge
                            tone={
                              simulate.data.shortage_risk === "high"
                                ? "amber"
                                : "neutral"
                            }
                          >
                            {simulate.data.shortage_risk}
                          </Badge>
                        </td>
                        <td>{simulate.data.recommendation}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="simulation-summary">
                  <Badge tone="amber">Simulation only</Badge>
                  <Badge
                    tone={
                      simulate.data.shortage_risk === "high" ? "amber" : "green"
                    }
                  >
                    {simulate.data.shortage_risk} shortage risk
                  </Badge>
                  <strong>
                    Recommendation: {simulate.data.recommendation}
                  </strong>
                </div>
                <div className="metrics-grid compact">
                  <Metric
                    label="Reorder point"
                    value={format(simulate.data.reorder_point)}
                    detail="Units · mean lead-time demand + buffer"
                    icon={Box}
                  />
                  <Metric
                    label="Safety stock"
                    value={format(simulate.data.safety_stock)}
                    detail="95% target, normal-demand assumption"
                    icon={ShieldCheck}
                  />
                  <Metric
                    label="Simulated service level"
                    value={`${format(simulate.data.proposed.service_level * 100)}%`}
                    detail="Holdout demand fulfilled"
                    icon={Gauge}
                  />
                  <Metric
                    label="Simulated holding cost"
                    value={format(simulate.data.proposed.holding_cost)}
                    detail="Dataset currency · holdout period"
                    icon={Database}
                  />
                </div>
                <InsightPanel title="Planning recommendation · simulation only">
                  {simulate.data.recommendation}. Current inventory is{" "}
                  {format(simulate.data.current_inventory, 0)} units against a
                  fitted reorder point of {format(simulate.data.reorder_point)}{" "}
                  units. The buffer policy changes holdout fill rate from{" "}
                  {format(simulate.data.baseline.service_level * 100)}% to{" "}
                  {format(simulate.data.proposed.service_level * 100)}%, with
                  holding cost changing from{" "}
                  {format(simulate.data.baseline.holding_cost)} to{" "}
                  {format(simulate.data.proposed.holding_cost)} dataset-currency
                  units. These are simulated outcomes under the recorded
                  supplier and demand assumptions; no operational order is
                  placed.
                </InsightPanel>
                <details className="assumptions">
                  <summary>Policy assumptions and baseline comparison</summary>
                  <pre>
                    {JSON.stringify(
                      {
                        assumptions: simulate.data.assumptions,
                        baseline: simulate.data.baseline,
                        proposed: simulate.data.proposed,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </>
            ) : (
              <p className="muted">
                Fit a reorder policy on the first 70% of demand, then replay it
                on the held-out 30%. Costs are simulated.
              </p>
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <Empty icon={Database} title="Start with a production dataset">
            Generate a reproducible synthetic dataset or import daily component
            demand from a CSV.
          </Empty>
        </section>
      )}
    </>
  );
}
