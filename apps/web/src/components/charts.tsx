"use client";
import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Forecast } from "@/lib/api";
const tick = {
  fill: "var(--muted)",
  fontSize: 10,
  fontFamily: "JetBrains Mono Variable, monospace",
};
const tooltip = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 11,
  color: "var(--text)",
};
export function Chart({
  data,
  inventory = false,
}: {
  data: Forecast["history"];
  inventory?: boolean;
}) {
  const id = useId().replaceAll(":", "");
  const points = data.map((p) => ({
    ...p,
    interval:
      p.lower != null && p.upper != null ? [p.lower, p.upper] : undefined,
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label={
        inventory
          ? "Recorded inventory over time"
          : "Actual demand and predicted demand over time; forecast is dashed"
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={{ left: -18, right: 12, top: 15, bottom: 0 }}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="var(--line-subtle)"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(s) => String(s).slice(5)}
            tick={tick}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
            dy={8}
          />
          <YAxis tick={tick} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={tooltip}
            labelStyle={{ color: "var(--secondary)" }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey={inventory ? "inventory" : "actual"}
            name={inventory ? "Inventory" : "Actual demand"}
            stroke="var(--accent)"
            fill={`url(#${id})`}
            strokeWidth={1.8}
            connectNulls={false}
          />
          {!inventory && (
            <>
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="interval"
                name="Residual band (uncalibrated)"
                stroke="none"
                fill="var(--blue)"
                fillOpacity={0.1}
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="predicted"
                name="Forecast"
                stroke="var(--blue)"
                strokeDasharray="5 4"
                fill="transparent"
                strokeWidth={1.8}
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ModelPerformance({
  data,
  metric = "mae",
}: {
  data: { model: string; [key: string]: unknown }[];
  metric?: string;
}) {
  return (
    <div
      className="chart compact-chart"
      role="img"
      aria-label={`Model comparison using ${metric}; zero-based scale`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 0, right: 25, top: 5, bottom: 0 }}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--line-subtle)"
            strokeDasharray="3 4"
          />
          <XAxis
            type="number"
            tick={tick}
            axisLine={false}
            tickLine={false}
            domain={[0, "auto"]}
          />
          <YAxis
            type="category"
            dataKey="model"
            width={100}
            tick={{ ...tick, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={tooltip}
            cursor={{ fill: "var(--accent-light)" }}
          />
          <Bar
            isAnimationActive={false}
            dataKey={metric}
            name={metric.toUpperCase()}
            fill="var(--accent)"
            maxBarSize={16}
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function TrainingProgress({
  history,
}: {
  history: Record<string, unknown>[];
}) {
  return (
    <div
      className="chart compact-chart"
      role="img"
      aria-label="Recorded validation loss by epoch"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history}>
          <CartesianGrid stroke="var(--line-subtle)" vertical={false} />
          <XAxis dataKey="epoch" tick={tick} />
          <YAxis tick={tick} domain={[0, "auto"]} />
          <Tooltip contentStyle={tooltip} />
          <Line
            isAnimationActive={false}
            dataKey="validation_loss"
            name="Validation loss"
            stroke="var(--accent)"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
