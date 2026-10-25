# Decision Intelligence Command Center

## Existing architecture

Next.js 16/React 19 with lazy-loaded Obsidian modules, TanStack Query and a same-origin FastAPI proxy. FastAPI uses SQLAlchemy/Alembic, PostgreSQL, Redis and JSON-only Celery jobs. Existing modules expose checkpoint vision inference, source-grounded knowledge, chronological forecasts, inventory replay and local/optional MLflow experiment provenance. No active industrial vision checkpoint or user login session is configured.

## Implementation sequence

1. Add nine normalized, indexed tables and an additive Alembic migration: component batches, investigations, quality observations, stage events, impact assessments, scenarios, recommendations, reviews and decision audit events.
2. Add bounded investigation schemas and APIs, image attachments, status/count/detail endpoints, a separately labelled synthetic demo and a dedicated Redis decision queue/worker. Persist stage progress and failures.
3. Call existing vision, retrieval, forecasting and inventory functions. Preserve model/dataset/evaluation links and source snapshots. Missing models remain unavailable; reported rejection counts are never extrapolated from one image.
4. Calculate usable stock/forecast shortfall deterministically and replay four explicitly simulated scenarios under editable assumptions. Compare a fixed original demand denominator; schedule deferral does not erase shortage.
5. Generate versioned structured recommendations with rule rationale, evidence, model output, uncertainty, risks and alternatives. Optional configured LLM explanations remain hypotheses.
6. Implement Draft → Awaiting Review → Approved/Rejected → Closed. Require a configured, hashed, high-entropy reviewer credential for final reviews, bind reviews to the exact recommendation/evidence hash, persist append-only audit rows and perform no external operational action.
7. Build `/decision-intelligence` with overview, interactive stage flow/timeline, image/evidence/impact inspectors, scenario comparison, recommendation and accessible review drawer. Reuse shared controls/charts and responsive tokens.
8. Run focused stage tests, a synthetic integration workflow, a real Redis worker/PostgreSQL smoke, existing regression checks, frontend checks/build and real browser desktop/mobile verification. Document actual outcomes and limits.

## Calculation and safety boundaries

Batch identity, inspected/rejected quantities and whether rejects are included in recorded stock are supplied by an operator and labelled as such. Image confidence is never a batch rejection rate. Forecasts retain the existing evaluation protocol and uncalibrated uncertainty bands. Scenario assumptions include recovery yield, reinspection time, supplier lead time, replacement quantity, schedule shift and holding rate. All costs and service impacts are simulated. Review is an authenticated local record; it has no execution adapter, equipment command or ERP side effect. Evidence becomes immutable after submission for review.

## Verification record

Implementation is complete. The final backend run passed 47 tests with one optional PostgreSQL service probe skipped; the live PostgreSQL schema and both migrations were separately verified. Eight frontend unit tests, Ruff, configured mypy, TypeScript, ESLint and production Docker builds passed. Real Redis delivery, actual CPU checkpoint inference/attribution, scenario editing, evidence invalidation, review submission, mobile dialogs, keyboard dismissal/focus restoration, and dark/light themes were exercised. See `docs/DECISION_INTELLIGENCE.md` for exact commands, results and limitations.

The synthetic case is persisted as Awaiting Review. No reviewer decision or operational action was performed. Browser checks at 1440, 768 and 390 pixels showed no horizontal overflow; scenario colors follow the shared theme tokens.

During final handoff, Docker Desktop's Linux engine returned internal errors even for `_ping`, and both local application ports timed out. After the user authorized restarting Docker Desktop, the engine recovered and the AutoMind API, web, decision worker, PostgreSQL and Redis services restarted. API readiness and the web route returned HTTP 200. The saved investigation retained its completed analysis, four scenarios, evidence hash and Awaiting Review status; no reviewer decision or operational action was recorded.
