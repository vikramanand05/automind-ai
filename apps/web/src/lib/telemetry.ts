export interface Telemetry {
  requests: number;
  errors: number;
  meanLatencyMs: number | null;
  startedAt: string | null;
  routes: {
    path: string;
    requests: number;
    errors: number;
    latencyMs: number | null;
  }[];
}
// Read only metrics already exposed by the existing backend. These are cumulative,
// process-local observations; they cannot answer historical range queries.
export function parseTelemetry(source: string): Telemetry | null {
  const routes = new Map<
    string,
    {
      path: string;
      requests: number;
      errors: number;
      seconds: number;
      count: number;
    }
  >();
  let startedAt: string | null = null;
  let recognized = false;
  for (const line of source.split("\n")) {
    const start = line.match(/^process_start_time_seconds\s+([\d.eE+-]+)/);
    if (start) {
      const stamp = Number(start[1]);
      if (Number.isFinite(stamp))
        startedAt = new Date(stamp * 1000).toISOString();
    }
    const sample = line.match(
      /^(automind_requests_total|automind_request_duration_seconds_sum|automind_request_duration_seconds_count)\{([^}]+)\}\s+([\d.eE+-]+)(?:\s|$)/,
    );
    if (!sample) continue;
    const path = sample[2].match(/(?:^|,)path="([^"]+)"/)?.[1];
    if (!path?.startsWith("/api/")) continue;
    const value = Number(sample[3]);
    if (!Number.isFinite(value) || value < 0) continue;
    recognized = true;
    const route = routes.get(path) || {
      path,
      requests: 0,
      errors: 0,
      seconds: 0,
      count: 0,
    };
    if (sample[1] === "automind_requests_total") {
      route.requests += value;
      const status = Number(sample[2].match(/(?:^|,)status="(\d+)"/)?.[1]);
      if (status >= 500) route.errors += value;
    }
    if (sample[1].endsWith("_sum")) route.seconds += value;
    if (sample[1].endsWith("_count")) route.count += value;
    routes.set(path, route);
  }
  if (!recognized) return null;
  const rows = Array.from(routes.values());
  const count = rows.reduce((n, r) => n + r.count, 0);
  return {
    requests: rows.reduce((n, r) => n + r.requests, 0),
    errors: rows.reduce((n, r) => n + r.errors, 0),
    meanLatencyMs: count
      ? (rows.reduce((n, r) => n + r.seconds, 0) / count) * 1000
      : null,
    startedAt,
    routes: rows
      .map((r) => ({
        path: r.path,
        requests: r.requests,
        errors: r.errors,
        latencyMs: r.count ? (r.seconds / r.count) * 1000 : null,
      }))
      .sort((a, b) => b.requests - a.requests),
  };
}
