"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, ChevronRight } from "lucide-react";
import { api, post, type Model, type Experiment } from "@/lib/api";
import {
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  FilterBar,
  DetailDrawer,
  KeyValues,
  ConfirmationDialog,
  LoadingSkeleton,
} from "@/components/ui/workspace";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
export default function Models() {
  const client = useQueryClient();
  const toast = useToast();
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api<Model[]>("/models"),
  });
  const experiments = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
  });
  const [search, setSearch] = useState("");
  const [state, setState] = useState("all");
  const searchParams = useSearchParams();
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const deepId = searchParams.get("inspect");
  const inspect =
    models.data?.find(
      (e) => e.id === (inspectedId || (deepId !== dismissedId ? deepId : null)),
    ) || null;
  const setInspect = (value: Model | null) => {
    setInspectedId(value?.id || null);
    if (!value) setDismissedId(deepId);
  };
  const [confirm, setConfirm] = useState<Model | null>(null);
  const activate = useMutation({
    mutationFn: (id: string) => post(`/models/${id}/activate`, {}),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["models"] });
      client.invalidateQueries({ queryKey: ["vision-models"] });
      client.invalidateQueries({ queryKey: ["system"] });
      setConfirm(null);
      setInspect(null);
      toast(
        "Model activated. Previous active model in this module is archived.",
      );
    },
  });
  const filtered =
    models.data?.filter(
      (m) =>
        (state === "all" || m.state === state) &&
        `${m.name} ${m.version} ${m.module}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  const related =
    experiments.data?.filter(
      (e) =>
        (!!inspect?.metadata?.checkpoint &&
          e.artifacts?.checkpoint === inspect.metadata.checkpoint) ||
        (!!inspect?.id && e.artifacts?.model_id === inspect.id) ||
        (!!inspect?.version &&
          e.module === inspect.module &&
          !!e.artifacts?.checkpoint &&
          e.artifacts.checkpoint.split(/[\\/]/).includes(inspect.version)),
    ) || [];
  return (
    <>
      <ErrorNotice
        error={models.error || activate.error || experiments.error}
      />
      <section className="panel">
        <SectionHead
          title="Registered checkpoints"
          action={<Badge>{models.data?.length ?? "—"} models</Badge>}
        />
        <FilterBar
          search={search}
          onSearch={setSearch}
          placeholder="Search model, module or version…"
        >
          <select
            aria-label="Filter model state"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="all">All lifecycle states</option>
            {["candidate", "active", "archived"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FilterBar>
        {models.isLoading ? (
          <LoadingSkeleton />
        ) : !filtered.length ? (
          <Empty
            icon={Box}
            title="No trained models available"
            action={
              <Link className="btn btn-outline" href="/training">
                Open Training Studio
              </Link>
            }
          >
            Train or register a model to begin evaluating manufacturing images.
            Completed checkpoints enter the registry as candidates.
          </Empty>
        ) : (
          <div className="model-grid">
            {filtered.map((m) => (
              <article className="panel model-card" key={m.id}>
                <SectionHead
                  title={m.name}
                  action={
                    <Badge
                      tone={
                        m.state === "active"
                          ? "green"
                          : m.state === "candidate"
                            ? "cyan"
                            : "neutral"
                      }
                    >
                      {m.state}
                    </Badge>
                  }
                />
                <KeyValues
                  values={{
                    version: m.version,
                    module: m.module,
                    architecture:
                      m.metadata.architecture ||
                      m.metadata.model ||
                      "See configuration",
                    dataset: m.metadata.dataset_checksum || "Not recorded",
                  }}
                />
                <div className="button-row">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setInspect(m)}
                  >
                    Model details
                    <ChevronRight size={13} />
                  </Button>
                  {m.state !== "active" && (
                    <Button size="sm" onClick={() => setConfirm(m)}>
                      Activate
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {inspect && (
        <DetailDrawer title={inspect.name} onClose={() => setInspect(null)}>
          <Badge tone={inspect.state === "active" ? "green" : "neutral"}>
            {inspect.state}
          </Badge>
          <h3>Model overview</h3>
          <KeyValues
            values={{
              id: inspect.id,
              version: inspect.version,
              module: inspect.module,
              state: inspect.state,
            }}
          />
          <h3>Checkpoint metadata</h3>
          <KeyValues values={inspect.metadata} />
          <h3>Recorded evaluations</h3>
          {related.length ? (
            related.map((e) => <KeyValues key={e.id} values={e.metrics} />)
          ) : (
            <p className="muted small-text">
              No evaluation with a matching model ID or checkpoint reference is
              recorded. Browse experiments for other runs.
            </p>
          )}
          <h3>Version history</h3>
          {models.data
            ?.filter((m) => m.name === inspect.name)
            .map((m) => (
              <div className="operation-row" key={m.id}>
                <code>{m.version}</code>
                <Badge>{m.state}</Badge>
              </div>
            ))}
          <h3>Deployment information</h3>
          <p className="small-text muted">
            {inspect.state === "active"
              ? "Selected for this module's local inference. This state does not establish artifact health or production deployment."
              : "This checkpoint is not selected for active inference."}{" "}
            Deployment timestamps and registry update timestamps are not exposed
            by the current API.
          </p>
          {inspect.state !== "active" && (
            <Button
              style={{ marginTop: 20 }}
              onClick={() => setConfirm(inspect)}
            >
              Activate checkpoint
            </Button>
          )}
        </DetailDrawer>
      )}
      {confirm && (
        <ConfirmationDialog
          title="Activate this checkpoint?"
          onClose={() => setConfirm(null)}
          onConfirm={() => activate.mutate(confirm.id)}
          pending={activate.isPending}
        >
          Activate <strong>{confirm.name}</strong> ({confirm.version}) for{" "}
          {confirm.module} inference. The current active checkpoint in this
          module will be archived. The backend checks that the checkpoint
          artifact exists.
          <ErrorNotice error={activate.error} />
        </ConfirmationDialog>
      )}
    </>
  );
}
