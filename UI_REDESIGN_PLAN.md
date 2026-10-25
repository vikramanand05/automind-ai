# AutoMind AI — Obsidian Intelligence redesign

## Existing application

- Next.js 16.4.3, React 19, TypeScript, Tailwind 4 and global CSS; Lucide icons and a Radix/CVA button.
- Eight routes: overview, knowledge, vision, production, training, experiments, pipelines and settings. A 2,100-line dashboard component contains their queries, forms and layouts.
- TanStack Query calls the existing same-origin `/api/v1` proxy. All document, forecast, simulation, job and registry mutations must remain real.
- Optional backend API-key authentication exists; there is no user account/session API. The user menu must describe the local workspace rather than imply authenticated identity.
- Current weaknesses: very small typography, light-first green palette, marketing hero above operational data, inconsistent chart colors, no global search, no separate registry/monitoring routes, limited filtering and inspection details.

## Design system

Obsidian Intelligence uses the requested graphite surfaces, titanium borders, restrained cyan, blue comparisons and semantic green/amber/red. Light mode uses cool neutral surfaces. Dark is the initial product theme; users can explicitly choose dark, light or system, persisted without a theme flash. Geist and JetBrains Mono are served locally.

Use 4/8px spacing, 8–12px radii, 13–15px body text, 11–12px metadata and tabular metrics. Shared components cover page headers, status badges, metrics, chart cards, loading/error/empty states, uploaders, drawers, confirmations, notifications, search and filters.

Muted and semantic text shades are slightly brighter in dark mode to preserve contrast on elevated panels; base graphite surfaces and the restrained cyan identity follow the concept palette.

## Implementation phases

1. Foundation: semantic tokens, local typography, theme persistence, controls, shared components and reduced-motion rules.
2. Shell: grouped collapsible sidebar, mobile drawer, breadcrumbs, command search, live system status, workspace menu and actual activity notifications.
3. Overview: operational KPIs, real activity, compatible measured model comparison, latest forecast, jobs/pipeline status and recent experiments.
4. AI modules: three-panel knowledge workspace; vision preview controls and real explanation/evaluation panels; training configuration/progress/details; production planning and actual simulation evidence.
5. MLOps: searchable/sortable experiment records with comparison/drawers, dedicated registry with actual candidate/active/archived states, pipeline execution detail and monitoring with explicit unavailable telemetry.
6. Polish: keyboard/focus behavior, mobile/tablet layouts, loading/error states, chart consistency, measured checks and screenshots.

## Data integrity and scope

Do not rebuild the backend, alter training logic, manufacture charts or replace endpoints with mocks. Derive activity from timestamped real experiments/jobs/pipelines/documents. Count active models only from registry state. Do not equate Redis connectivity with worker liveness. Model/pipeline durations and step-level telemetry are unavailable unless recorded; display that limitation. Comparison requires compatible dataset and evaluation configuration. Synthetic datasets remain labelled. Activation and deletion require a concrete confirmation dialog.

## Accessibility and performance

Semantic navigation/table/form markup, skip link, visible focus, labelled icon buttons, keyboard-operated modal dialogs with focus restoration/trapping, aria-live notifications, text alongside status colors, adequate token contrast and reduced-motion support. Mobile drawers must close on navigation/Escape; pages must not overflow at 390px. Heavy chart modules load through dynamic imports. Keep tables within scrollable regions; the API caps records at 100, so virtualization is unnecessary here.

## Verification strategy

At implementation checkpoints run TypeScript, ESLint and the Linux Docker production build (native SWC is blocked by Windows Application Control). Verify existing API workflows using the running backend. Use the computer-use skill for real browser interaction and inspect screenshots of each major page at desktop and mobile sizes, plus light theme and keyboard/search/dialog behavior. Record actual outcomes and limitations in this document; do not claim Lighthouse or WCAG certification without an audit.

## Results

### Implemented

| Phase | Delivered | Validation |
|---|---|---|
| 1 — Foundation | Requested semantic graphite/cyan palette, polished light mode, local Geist and JetBrains Mono, shared controls, persisted dark/light/system preference | Local font family observed in the browser; light preference survives reload; 12 text-token/panel contrast combinations exceed 4.5:1 (minimum 4.94:1). This is not a complete WCAG audit. |
| 2 — Shell | Grouped collapsible sidebar, mobile drawer, breadcrumbs, command search across pages/documents/models/runs, actual job/pipeline notifications, workspace menu, live backend connectivity | Keyboard Ctrl+K, arrow/Enter search navigation, sidebar persistence, mobile navigation, Escape dismissal and initial confirmation focus observed. No identity or unread count is fabricated. |
| 3 — Overview | Actual active-model count, explicit quality-data gap, measured forecast MAE, job count, event feed, compatible model comparison, demand forecast and sortable recent runs | Real recorded forecasts/experiments rendered in dark and light modes; bars start at zero and incompatible runs are excluded. |
| 4 — AI workflows | Three-panel knowledge workspace with safe Markdown, citations, copy/clear and retrieval details; Studio configuration/progress/details; vision preview/zoom/pan and actual-attribution comparison; production forecast bands, inventory table and evidence-based simulation | Browser document upload completed (idempotent sample), real cited answer returned the fictional 14-day interval, copy toast observed, deletion confirmation opened/cancelled; preset overrides reset correctly; local image preview/zoom/reset worked and inference stayed disabled without a checkpoint; real XGBoost forecast and inventory replay completed. |
| 5 — MLOps | Experiment filters/sort/comparison/inspectors, dedicated registry, pipeline quality/detail workflow, monitoring with real cumulative API counters plus explicit historical/worker/GPU gaps | Different-component comparisons were blocked; compatible selections and real provenance drawer inspected; recorded ingestion quality and workflow inspected. Existing metrics endpoint returned HTTP 200 through the new read-only frontend proxy. |
| 6 — Polish | Skeleton loading, focus states, native modal dialogs, confirmation flows, toasts, reduced-motion CSS, responsive chart/table containment, dependent actions disabled during ingestion | Mobile review exposed and fixed absolute table-label/tooltip overflow and a generation/forecast race. All major views inspected at 1440px desktop and 390px mobile; additional 1280px overview, 1024px knowledge and 768px Studio layouts inspected. |

### Checks and evidence

- Linux Docker production builds, TypeScript and ESLint passed after implementation and QA fixes. The final source uses the supported Node test command; its two module-type warnings are informational and are not suppressed.
- Eight frontend behavioral tests passed for dataset/protocol comparison safeguards and Prometheus parsing, unavailable data and duration calculation. Run `npm run test:unit` in `apps/web`; CI includes this command.
- All ten routes returned HTTP 200. A persistent Node HTTP pass measured 29.32–375.80 ms on this local host while Docker was active. These are single local request timings, not browser paint, field performance or Core Web Vitals results. Raw measurements: ignored `runtime/ui-node-http-checks.json`.
- The npm dependency audit reported zero known advisories after adding local fonts and Markdown dependencies. Backend dependencies and training logic were not changed.
- Screenshot evidence: `docs/screenshots/obsidian/`. Browser checks use the real running API; no mock API responses or invented series were used.
- Mobile page width checks reported document width at or below the viewport after the containment fix. Data tables and the pipeline workflow retain their own horizontal scrolling.
- Final generation → forecast → simulation workflow preserved its measured forecast result; the final browser review recorded no console errors. Native modal background scrolling was suppressed and keyboard focus remained inside the open inspector.
- Safe Markdown skips raw HTML and automatic remote images; retrieved source content is not executable UI.

### Deliberate capability limits

No active industrial vision model or live training job is present, so populated inference attribution, checkpoint activation and live-loss states could not be browser-verified against an industrial checkpoint. Their controls use the existing APIs and real returned metadata; no synthetic UI results were added. Four-way language quality comparisons require recorded evaluations. The job API does not expose step, ETA or live learning-rate telemetry. Model update/deployment timestamps and pipeline stage durations/logs are not exposed and are labelled unavailable.

The monitoring page reads actual cumulative process counters from the existing `/metrics` endpoint via a same-origin rewrite. Historical range panels require Prometheus; worker heartbeat, GPU utilization and aggregate vision latency remain unavailable. Redis connectivity is never presented as worker liveness. Optional services were not started for this frontend redesign. No Lighthouse score, Core Web Vitals pass or comprehensive WCAG certification is claimed. The supplied Playwright CLI suite was not executed; actual browser workflows were exercised through computer-use automation.
