import test from "node:test";
import assert from "node:assert/strict";
import { parseTelemetry } from "../../apps/web/src/lib/telemetry.ts";
test("parses only recorded API counters and computes duration from sum/count", () => {
  const result = parseTelemetry(`process_start_time_seconds 1700000000
automind_requests_total{method="GET",path="/api/v1/models",status="200"} 8
automind_requests_total{method="POST",path="/api/v1/models",status="503"} 2
automind_requests_total{method="GET",path="/health/ready",status="200"} 100
automind_request_duration_seconds_sum{path="/api/v1/models"} 2
automind_request_duration_seconds_count{path="/api/v1/models"} 10
automind_request_duration_seconds_sum{path="/health/ready"} 50
automind_request_duration_seconds_count{path="/health/ready"} 100`);
  assert.equal(result?.requests, 10);
  assert.equal(result?.errors, 2);
  assert.equal(result?.meanLatencyMs, 200);
  assert.equal(result?.routes.length, 1);
  assert.equal(result?.startedAt, "2023-11-14T22:13:20.000Z");
});
test("absent metrics produce unavailable rather than invented zeroes", () => {
  assert.equal(parseTelemetry("# no metrics"), null);
  assert.equal(
    parseTelemetry('automind_requests_total{path="/metrics",status="200"} 10'),
    null,
  );
});
test("a counter without histogram data has unavailable duration", () => {
  const r = parseTelemetry(
    'automind_requests_total{path="/api/v1/models",status="200"} 3',
  );
  assert.equal(r?.requests, 3);
  assert.equal(r?.meanLatencyMs, null);
  assert.equal(r?.routes[0].latencyMs, null);
});
test("malformed, negative and non-finite samples are ignored", () => {
  assert.equal(
    parseTelemetry(
      'automind_requests_total{path="/api/v1/models",status="200"} -2',
    ),
    null,
  );
  assert.equal(
    parseTelemetry(
      'automind_requests_total{path="/api/v1/models",status="200"} +Inf',
    ),
    null,
  );
});
