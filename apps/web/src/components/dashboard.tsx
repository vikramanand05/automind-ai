"use client";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { AppShell } from "./app-shell";
import { LoadingSkeleton } from "./ui/workspace";
const Overview = dynamic(() => import("./modules/overview"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const DecisionIntelligence = dynamic(
  () => import("./modules/decision-intelligence"),
  { loading: () => <LoadingSkeleton rows={5} /> },
);
const Knowledge = dynamic(() => import("./modules/knowledge"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Vision = dynamic(() => import("./modules/vision"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Production = dynamic(() => import("./modules/production"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Training = dynamic(() => import("./modules/training"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Experiments = dynamic(() => import("./modules/experiments"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Models = dynamic(() => import("./modules/models"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Pipelines = dynamic(() => import("./modules/pipelines"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Monitoring = dynamic(() => import("./modules/monitoring"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
const Settings = dynamic(() => import("./modules/settings"), {
  loading: () => <LoadingSkeleton rows={5} />,
});
export function Dashboard({ section }: { section: string }) {
  return (
    <AppShell section={section}>
      {(system) => (
        <Suspense fallback={<LoadingSkeleton rows={5} />}>
          <>
            {section === "decision-intelligence" && <DecisionIntelligence />}
            {section === "overview" && <Overview system={system} />}{" "}
            {section === "knowledge" && <Knowledge />}{" "}
            {section === "vision" && <Vision />}{" "}
            {section === "production" && <Production />}{" "}
            {section === "training" && (
              <Training enabled={system?.training_enabled || false} />
            )}{" "}
            {section === "experiments" && <Experiments />}{" "}
            {section === "models" && <Models />}{" "}
            {section === "pipelines" && <Pipelines />}{" "}
            {section === "monitoring" && <Monitoring system={system} />}{" "}
            {section === "settings" && <Settings system={system} />}
          </>
        </Suspense>
      )}
    </AppShell>
  );
}
