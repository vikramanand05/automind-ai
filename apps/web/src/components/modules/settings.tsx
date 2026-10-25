"use client";
import { ArrowUpRight, ShieldCheck, Sun, Moon, Monitor } from "lucide-react";
import { Badge, SectionHead } from "@/components/ui/workspace";
import { useTheme } from "@/components/providers";
import type { SystemStatus } from "@/lib/api";
export default function SettingsPage({ system }: { system?: SystemStatus }) {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <section className="panel">
        <SectionHead title="Appearance" />
        <p className="panel-subtitle">
          Obsidian Intelligence · Choose how your workspace looks.
        </p>
        <div className="theme-options">
          {(["dark", "light", "system"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
            >
              {value === "dark" ? (
                <Moon size={17} />
              ) : value === "light" ? (
                <Sun size={17} />
              ) : (
                <Monitor size={17} />
              )}{" "}
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <p className="chart-note">
          Your preference is saved in this browser. System follows your device
          appearance.
        </p>
      </section>
      <div className="info-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>Local development configuration</strong>
          <p>
            Change environment variables in your local .env file and restart the
            API. Secrets are never exposed here.
          </p>
        </div>
        <Badge>Portfolio edition</Badge>
      </div>
      <div className="two-columns">
        <section className="panel">
          <SectionHead title="Runtime configuration" />
          {[
            { name: "API version", value: system?.version },
            { name: "Database backend", value: system?.database_backend },
            { name: "Embedding mode", value: system?.embedding_mode },
            { name: "Language mode", value: system?.llm_mode },
            {
              name: "Training",
              value: system?.training_enabled ? "Enabled" : "Disabled",
            },
            { name: "Upload limit", value: "10 MB (default)" },
          ].map((s) => (
            <div className="setting-row" key={s.name}>
              <span>{s.name}</span>
              <code>{s.value || "Connecting…"}</code>
            </div>
          ))}
        </section>
        <section className="panel">
          <SectionHead title="Local services" />
          {[
            {
              name: "REST API & OpenAPI",
              url: `${system?.public_api_url || "http://localhost:8000"}/docs`,
            },
            {
              name: "MLflow experiment tracking",
              url: "http://localhost:5000",
            },
            { name: "Airflow orchestration", url: "http://localhost:8080" },
            { name: "Prometheus metrics", url: "http://localhost:9090" },
            { name: "Grafana dashboards", url: "http://localhost:3001" },
          ].map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="service-link"
            >
              <span>
                {s.name}
                <small>{s.url}</small>
              </span>
              <ArrowUpRight size={16} />
            </a>
          ))}
          <p className="chart-note">
            Additional services require the full Docker Compose profile.
          </p>
        </section>
      </div>
    </>
  );
}
