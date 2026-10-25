"use client";
import { useEffect, useRef, useId, type ReactNode } from "react";
import {
  AlertCircle,
  Database,
  LoaderCircle,
  Search,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "./button";
export const format = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
export const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title,
  children,
  icon: Icon = Database,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={23} />
      </div>
      <h3>{title}</h3>
      <div className="empty-description">{children}</div>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
export function ErrorNotice({ error }: { error: Error | null | undefined }) {
  return error ? (
    <div className="error" role="alert">
      <AlertCircle size={16} />
      <span>{error.message}</span>
    </div>
  ) : null;
}
export function SectionHead({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}
export function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <article className="metric panel">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loading-skeleton" role="status" aria-label="Loading data">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
      <span className="sr-only">Loading data</span>
    </div>
  );
}
export function InsightPanel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="insight-panel">
      <div className="insight-mark" />
      <div>
        <h3>{title}</h3>
        <div>{children}</div>
        {action}
      </div>
    </div>
  );
}
export function FilterBar({
  search,
  onSearch,
  placeholder = "Search records…",
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  children?: ReactNode;
}) {
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Search size={16} />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
      </label>
      {children}
    </div>
  );
}
export function DetailDrawer({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`detail-drawer ${wide ? "wide" : ""}`}
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">Workspace inspector</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
        >
          <X size={20} />
        </button>
      </header>
      <div className="drawer-content">{children}</div>
    </dialog>
  );
}
export function ConfirmationDialog({
  title,
  children,
  onClose,
  onConfirm,
  pending = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => active?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-labelledby={id}
      onCancel={onClose}
    >
      <h2 id={id}>{title}</h2>
      <div className="dialog-description">{children}</div>
      <div className="button-row">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={pending}>
          {pending ? <LoaderCircle size={15} className="spin" /> : null}Confirm
        </Button>
      </div>
    </dialog>
  );
}
export function FileUploader({
  accept,
  onFile,
  pending = false,
  title = "Drop a file here",
  description = "or browse files",
  id,
}: {
  accept: string;
  onFile: (file: File) => void;
  pending?: boolean;
  title?: string;
  description?: string;
  id?: string;
}) {
  return (
    <label
      className={`upload-zone ${pending ? "loading" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (!pending && e.dataTransfer.files[0])
          onFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        aria-label={title}
        disabled={pending}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {pending ? (
        <LoaderCircle size={23} className="spin" />
      ) : (
        <Upload size={23} />
      )}
      <strong>{pending ? "Processing file…" : title}</strong>
      <span>{description}</span>
      <small>Maximum 10 MB</small>
    </label>
  );
}
export function KeyValues({ values }: { values: Record<string, unknown> }) {
  return (
    <dl className="key-values">
      {Object.entries(values).map(([key, value]) => (
        <div key={key}>
          <dt>{key.replaceAll("_", " ")}</dt>
          <dd>
            {value == null ? (
              "Unavailable"
            ) : typeof value === "object" ? (
              <pre>{JSON.stringify(value, null, 2)}</pre>
            ) : (
              String(value)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
