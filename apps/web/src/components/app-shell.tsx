"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  Cpu,
  Workflow,
  FlaskConical,
  GitBranch,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ScanLine,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  api,
  type SystemStatus,
  type Experiment,
  type Document,
  type Model,
  type Job,
  type Pipeline,
} from "@/lib/api";
import { useTheme, usePreference } from "./providers";
import {
  DetailDrawer,
  ErrorNotice,
  LoadingSkeleton,
  date,
} from "./ui/workspace";
import { Button } from "./ui/button";
export const navigation = [
  {
    id: "decision-intelligence",
    name: "Decision Intelligence",
    icon: Workflow,
    group: "Workspace",
  },
  {
    id: "overview",
    name: "Overview",
    icon: LayoutDashboard,
    group: "Workspace",
  },
  {
    id: "knowledge",
    name: "Industrial Knowledge",
    icon: BookOpen,
    group: "Workspace",
  },
  {
    id: "vision",
    name: "Manufacturing Vision",
    icon: ScanLine,
    group: "Workspace",
  },
  {
    id: "production",
    name: "Production Intelligence",
    icon: Activity,
    group: "Workspace",
  },
  {
    id: "training",
    name: "Fine-Tuning Studio",
    icon: Cpu,
    group: "AI operations",
  },
  { id: "models", name: "Model Registry", icon: Box, group: "AI operations" },
  {
    id: "experiments",
    name: "Experiment Laboratory",
    icon: FlaskConical,
    group: "AI operations",
  },
  {
    id: "pipelines",
    name: "Data Pipelines",
    icon: GitBranch,
    group: "AI operations",
  },
  { id: "monitoring", name: "Monitoring", icon: Activity, group: "System" },
  { id: "settings", name: "Settings", icon: Settings, group: "System" },
];
const titles: Record<string, [string, string]> = {
  "decision-intelligence": [
    "Decision Intelligence Command Center",
    "From industrial signals to explainable operational decisions.",
  ],
  overview: [
    "Industrial Intelligence Overview",
    "Unified visibility across AI models, manufacturing quality, and production operations.",
  ],
  knowledge: [
    "Industrial Knowledge",
    "Technical answers. Traceable evidence. One engineering workspace.",
  ],
  vision: [
    "Manufacturing Vision",
    "Inspect surfaces, evaluate models, and understand every prediction.",
  ],
  production: [
    "Production Intelligence",
    "Demand forecasting and inventory decisions, grounded in measured evidence.",
  ],
  training: [
    "Fine-Tuning Studio",
    "Configure, train, and evaluate reproducible industrial AI models.",
  ],
  experiments: [
    "Experiment Laboratory",
    "Compare measured results. Inspect the evidence behind every run.",
  ],
  models: [
    "Model Registry",
    "Versioned checkpoints and a controlled path to active inference.",
  ],
  pipelines: [
    "Data Pipelines",
    "Trace every dataset from ingestion to validated, versioned intelligence.",
  ],
  monitoring: [
    "Monitoring",
    "Infrastructure connectivity and observability across your AI workspace.",
  ],
  settings: [
    "Settings",
    "Workspace preferences, runtime capabilities, and connected services.",
  ],
};
export function AppShell({
  section,
  children,
}: {
  section: string;
  children: (system: SystemStatus | undefined) => ReactNode;
}) {
  const client = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [sidebar, setSidebar] = usePreference<string>(
    "automind-sidebar",
    "expanded",
  );
  const collapsed = sidebar === "collapsed";
  const [search, setSearch] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [user, setUser] = useState(false);
  const { theme, setTheme } = useTheme();
  const system = useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemStatus>("/system/status"),
    refetchInterval: 30000,
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key === "Escape") {
        setMenu(false);
        setUser(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  const mobileRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const prev = document.activeElement as HTMLElement;
    const el = mobileRef.current;
    const first = el?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)"),
      );
      const a = items[0],
        z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z?.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", trap);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [menu]);
  const healthy =
    !system.isError &&
    system.data?.database === "connected" &&
    system.data?.redis === "connected";
  const [title, description] = titles[section] || titles.overview;
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        ref={mobileRef}
        className={`sidebar ${menu ? "is-open" : ""}`}
        aria-label="Workspace navigation"
        role={menu ? "dialog" : undefined}
        aria-modal={menu ? true : undefined}
      >
        <Link className="brand" href="/" onClick={() => setMenu(false)}>
          <div className="brand-mark">
            <Network size={21} strokeWidth={1.5} />
          </div>
          <div className="brand-copy">
            <strong>AUTOMIND</strong>
            <small>Industrial Intelligence</small>
          </div>
        </Link>
        <button
          className="icon-button mobile-close"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={18} />
        </button>
        <div className="workspace-switch">
          <Box size={17} />
          <div>
            <strong>Industrial workspace</strong>
            <small>Local environment</small>
          </div>
          <span
            className="online-dot"
            style={{
              background: healthy ? "var(--success)" : "var(--warning)",
            }}
          />
        </div>
        <nav aria-label="Main navigation">
          {["Workspace", "AI operations", "System"].map((group) => (
            <div className="nav-group" key={group}>
              <div className="nav-caption">{group.toUpperCase()}</div>
              {navigation
                .filter((n) => n.group === group)
                .map(({ id, name, icon: Icon }) => (
                  <Link
                    key={id}
                    href={id === "overview" ? "/" : `/${id}`}
                    className={`nav-item ${section === id ? "active" : ""}`}
                    aria-current={section === id ? "page" : undefined}
                    aria-label={name}
                    data-tooltip={name}
                    title={collapsed ? name : undefined}
                    onClick={() => setMenu(false)}
                  >
                    <Icon size={17} />
                    <span className="nav-label">{name}</span>
                    {id === "training" && <span className="nav-tag">LAB</span>}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <div>
              <span className={`online-dot ${healthy ? "" : "offline-dot"}`} />
              {system.isLoading
                ? "Checking services"
                : healthy
                  ? "Core services connected"
                  : "Connection requires attention"}
            </div>
            <small>Observed from the backend · 30s refresh</small>
          </div>
          <div className="sidebar-foot">
            <span>
              WORKSPACE <code>01</code>
            </span>
            <button
              className="icon-button collapse-button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                setSidebar(collapsed ? "expanded" : "collapsed");
              }}
            >
              {collapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <span>Industrial workspace</span>
            <ChevronRight size={13} />
            <strong>
              {navigation.find((n) => n.id === section)?.name || "Overview"}
            </strong>
          </nav>
          <div className="top-actions">
            <button
              className="search-trigger"
              aria-label="Search workspace"
              onClick={() => setSearch(true)}
            >
              <Search size={15} />
              <span>Search workspace…</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="system-indicator" role="status">
              <span className={`online-dot ${healthy ? "" : "offline-dot"}`} />
              {system.isLoading
                ? "CHECKING SYSTEM"
                : healthy
                  ? "CORE SYSTEM OPERATIONAL"
                  : "SYSTEM DEGRADED"}
            </span>
            <button
              className="icon-button"
              aria-label="Open notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              title={`Theme: ${theme}`}
              onClick={() =>
                setTheme(
                  document.documentElement.dataset.theme === "dark"
                    ? "light"
                    : "dark",
                )
              }
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="popover-anchor">
              <button
                className="avatar user-trigger"
                aria-label="Workspace menu"
                aria-expanded={user}
                onClick={() => setUser(!user)}
              >
                AM
              </button>
              {user && (
                <div className="popover">
                  <h3>Local workspace</h3>
                  <p>No user authentication session is configured.</p>
                  <Link href="/settings" onClick={() => setUser(false)}>
                    <Settings size={15} />
                    Workspace settings
                  </Link>
                  <button onClick={() => setTheme("system")}>
                    <Monitor size={15} />
                    Use system theme {theme === "system" && <Check size={14} />}
                  </button>
                  <a
                    href={`${system.data?.public_api_url || "http://localhost:18000"}/docs`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ArrowUpRight size={15} />
                    API documentation
                  </a>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                {section === "overview"
                  ? "Command center"
                  : section === "settings" || section === "monitoring"
                    ? "System workspace"
                    : "Industrial intelligence"}
              </div>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <div className="heading-action">
              <span className="page-date">
                {new Date().toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => client.invalidateQueries()}
                aria-label="Refresh workspace data"
              >
                <RefreshCw
                  size={13}
                  className={system.isFetching ? "spin" : ""}
                />
                Refresh
              </Button>
            </div>
          </div>
          <ErrorNotice error={system.error} />
          {system.isLoading ? <LoadingSkeleton /> : children(system.data)}
          <footer>
            <span>
              <Network size={12} />
              AutoMind AI <span className="muted">/</span> Industrial
              Intelligence
            </span>
            <span>
              <ShieldCheck size={12} />
              Local workspace · Synthetic data is labelled
            </span>
          </footer>
        </main>
      </div>
      {search && <SearchCommand onClose={() => setSearch(false)} />}{" "}
      {notifications && (
        <Notifications onClose={() => setNotifications(false)} />
      )}
    </div>
  );
}
function SearchCommand({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<Document[]>("/knowledge/documents"),
  });
  const models = useQuery({
    queryKey: ["models"],
    queryFn: () => api<Model[]>("/models"),
  });
  const runs = useQuery({
    queryKey: ["experiments"],
    queryFn: () => api<Experiment[]>("/experiments"),
  });
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => active?.focus();
  }, []);
  const records = [
    ...navigation.map((n) => ({
      name: n.name,
      meta: n.group,
      href: n.id === "overview" ? "/" : `/${n.id}`,
      icon: n.icon,
    })),
    ...(docs.data || []).map((d) => ({
      name: d.filename,
      meta: "Indexed document",
      href: "/knowledge",
      icon: BookOpen,
    })),
    ...(models.data || []).map((m) => ({
      name: m.name,
      meta: `Model · ${m.version}`,
      href: `/models?inspect=${m.id}`,
      icon: Box,
    })),
    ...(runs.data || []).map((r) => ({
      name: r.model,
      meta: `Experiment · ${r.id.slice(0, 8)}`,
      href: `/experiments?inspect=${r.id}`,
      icon: FlaskConical,
    })),
  ].filter((r) =>
    `${r.name} ${r.meta}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <dialog
      ref={ref}
      className="command-dialog"
      aria-label="Search workspace"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="command-search">
        <Search size={20} />
        <input
          autoFocus
          aria-label="Search pages, documents, models and runs"
          placeholder="Search pages, documents, models, runs…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              ref.current
                ?.querySelector<HTMLAnchorElement>(".command-results a")
                ?.focus();
            }
            if (e.key === "Enter" && records[0]) {
              router.push(records[0].href);
              onClose();
            }
          }}
        />
        <button
          className="icon-button"
          aria-label="Close search"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </div>
      <ErrorNotice error={docs.error || models.error || runs.error} />
      <div
        className="command-results"
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          const links = Array.from(
            ref.current?.querySelectorAll<HTMLAnchorElement>(
              ".command-results a",
            ) || [],
          );
          const index = links.indexOf(
            document.activeElement as HTMLAnchorElement,
          );
          e.preventDefault();
          links[
            (index + (e.key === "ArrowDown" ? 1 : -1) + links.length) %
              links.length
          ]?.focus();
        }}
      >
        {records.slice(0, 16).map((r, i) => (
          <Link key={`${r.href}-${i}`} href={r.href} onClick={onClose}>
            <r.icon size={16} />
            <div>
              {r.name}
              <small>{r.meta}</small>
            </div>
          </Link>
        ))}
        {!records.length && <p className="empty">No matching records found.</p>}
      </div>
      <div className="command-footer">
        <span>↑ ↓ Navigate · Enter Open</span>
        <span>Esc Close</span>
      </div>
    </dialog>
  );
}
function Notifications({ onClose }: { onClose: () => void }) {
  const jobs = useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Job[]>("/training/jobs"),
  });
  const pipes = useQuery({
    queryKey: ["pipelines"],
    queryFn: () => api<Pipeline[]>("/pipelines"),
  });
  const records = [
    ...(jobs.data || []).map((j) => ({
      id: j.id,
      label: `${j.kind} training · ${j.status}`,
      time: j.created_at,
      href: "/training",
      status: j.status,
    })),
    ...(pipes.data || []).map((p) => ({
      id: p.id,
      label: `Dataset ingestion · ${p.status}`,
      time: p.created_at,
      href: `/pipelines?inspect=${p.id}`,
      status: p.status,
    })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  return (
    <DetailDrawer title="Workspace notifications" onClose={onClose}>
      <p className="panel-subtitle">
        Recorded job and pipeline events. No unread count is inferred.
      </p>
      <ErrorNotice error={jobs.error || pipes.error} />
      {!records.length && (
        <p className="muted">No job or pipeline events have been recorded.</p>
      )}
      {records.map((r) => (
        <Link
          className="activity-item"
          href={r.href}
          key={r.id}
          onClick={onClose}
        >
          <div className="activity-icon">
            <Bell size={15} />
          </div>
          <div>
            <strong>{r.label}</strong>
            <p>{date(r.time)}</p>
          </div>
          <ChevronRight size={14} />
        </Link>
      ))}
    </DetailDrawer>
  );
}
