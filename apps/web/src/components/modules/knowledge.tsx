"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Copy,
  LoaderCircle,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, post, type Document, type Answer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Badge,
  Empty,
  ErrorNotice,
  SectionHead,
  FileUploader,
  ConfirmationDialog,
  KeyValues,
  LoadingSkeleton,
  format,
  date,
} from "@/components/ui/workspace";
import { useToast } from "@/components/providers";
const questionSchema = z.object({
  question: z.string().trim().min(3, "Enter at least 3 characters").max(4000),
});
export default function Knowledge() {
  const client = useQueryClient();
  const toast = useToast();
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: () => api<Document[]>("/knowledge/documents"),
  });
  const [messages, setMessages] = useState<
    { question: string; result: Answer }[]
  >([]);
  const [topK, setTopK] = useState(4);
  const [threshold, setThreshold] = useState(0.12);
  const [model, setModel] = useState("extractive");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Document | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<number | null>(null);
  const chat = useRef<HTMLDivElement>(null);
  const form = useForm<z.infer<typeof questionSchema>>({
    resolver: zodResolver(questionSchema),
    defaultValues: { question: "" },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return api<Document>("/knowledge/documents", { method: "POST", body });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["documents"] });
      client.invalidateQueries({ queryKey: ["system"] });
      toast("Document indexed. Source passages are ready for retrieval.");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/knowledge/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["documents"] });
      client.invalidateQueries({ queryKey: ["system"] });
      setConfirm(null);
      toast("Document removed from the library and retrieval index.");
    },
  });
  const ask = useMutation({
    mutationFn: ({ question }: { question: string }) =>
      post<Answer>("/knowledge/query", {
        question,
        top_k: topK,
        threshold,
        model,
        history: messages.slice(-2).map((m) => m.question),
      }),
    onSuccess: (result, values) => {
      setMessages((m) => [...m, { question: values.question, result }]);
      setSelectedMessage(null);
      form.reset();
      requestAnimationFrame(() => {
        if (chat.current) chat.current.scrollTop = chat.current.scrollHeight;
      });
    },
  });
  const latest =
    selectedMessage == null
      ? messages.at(-1)?.result
      : messages[selectedMessage]?.result;
  const filtered =
    docs.data?.filter((d) =>
      d.filename.toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="knowledge-layout">
      <section className="panel document-panel">
        <SectionHead
          title="Document Library"
          action={<Badge>{docs.data?.length ?? "—"}</Badge>}
        />
        <FileUploader
          id="document-upload"
          accept=".pdf,.md,.txt,.csv"
          pending={upload.isPending}
          onFile={(f) => upload.mutate(f)}
          title="Upload document"
          description="Drop or browse · PDF, TXT, MD, CSV"
        />
        <ErrorNotice error={upload.error || remove.error || docs.error} />
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search documents"
            placeholder="Search documents…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {docs.isLoading ? (
          <LoadingSkeleton />
        ) : filtered.length ? (
          <div className="document-list">
            {filtered.map((doc) => (
              <div className="document-row" key={doc.id}>
                <BookOpen size={16} />
                <div>
                  <strong>{doc.filename}</strong>
                  <span>
                    {doc.chunks} chunks · {format(doc.size / 1024, 1)} KB
                  </span>
                  <span>{date(doc.created_at)}</span>
                  <Badge tone="green">Indexed</Badge>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Delete ${doc.filename}`}
                  title={`Delete ${doc.filename}`}
                  onClick={() => setConfirm(doc)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            icon={BookOpen}
            title={
              search ? "No matching documents" : "No documents indexed yet"
            }
          >
            Upload technical documentation to enable grounded industrial
            knowledge retrieval.
          </Empty>
        )}
        <p className="chart-note">
          Files are parsed and indexed by the backend. Sources retain their
          document and page references.
        </p>
      </section>
      <section className="panel chat-panel">
        <SectionHead
          title="Engineering Assistant"
          action={
            <div className="button-row">
              <Badge tone="cyan">Source grounded</Badge>
              <button
                className="icon-button"
                aria-label="Clear conversation"
                title="Clear conversation"
                disabled={!messages.length || ask.isPending}
                onClick={() => {
                  setMessages([]);
                  setSelectedMessage(null);
                  toast("Conversation cleared in this browser session.");
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          }
        />
        <div className="chat-messages" ref={chat} aria-live="polite">
          {!messages.length && (
            <Empty
              icon={MessageSquare}
              title="Engineering knowledge, with evidence"
            >
              Ask a specific question about your indexed documentation.
              <div className="prompt-chips">
                {[
                  "What is the inspection interval?",
                  "Summarize the maintenance procedure.",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      form.setValue("question", q);
                      form.setFocus("question");
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </Empty>
          )}
          {messages.map((m, i) => (
            <div className="chat-exchange" key={i}>
              <div className="user-message">{m.question}</div>
              <div className="assistant-message">
                <div className="answer-label">
                  <Sparkles size={14} />
                  AUTOMIND <span className="muted">/ {m.result.mode}</span>
                </div>
                <div className="answer-content">
                    <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]}>
                    {m.result.answer}
                  </Markdown>
                </div>
                <div className="sources">
                  {m.result.sources.map((s, j) => (
                    <details key={s.chunk_id}>
                      <summary>
                        <BookOpen size={12} />[{j + 1}] {s.filename}
                        {s.page ? ` · p.${s.page}` : ""}
                        <span>score {format(s.score, 3)}</span>
                      </summary>
                      <p>{s.text}</p>
                    </details>
                  ))}
                </div>
                <div className="answer-meta">
                  <span className="mono">
                    {format(m.result.latency_ms)} ms · {m.result.embedding_mode}
                  </span>
                  <div className="button-row">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedMessage(i)}
                    >
                      Inspect retrieval
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Copy response ${i + 1}`}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.result.answer);
                          toast("Response copied.");
                        } catch {
                          toast(
                            "Clipboard unavailable. Select the response text to copy it.",
                          );
                        }
                      }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="answer-label" role="status">
              <LoaderCircle size={15} className="spin" />
              Retrieving evidence and generating a response…
            </div>
          )}
        </div>
        <ErrorNotice error={ask.error} />
        <form
          className="chat-input"
          onSubmit={form.handleSubmit((v) => ask.mutate(v))}
        >
          <input
            aria-label="Question"
            placeholder="Ask a technical question…"
            {...form.register("question")}
          />
          <Button
            type="submit"
            disabled={ask.isPending}
            aria-label="Send question"
          >
            {ask.isPending ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Send size={16} />
            )}
          </Button>
        </form>
        {form.formState.errors.question && (
          <p className="error" role="alert">
            {form.formState.errors.question.message}
          </p>
        )}
        <div className="chat-disclaimer">
          <ShieldCheck size={12} />
          Verify critical procedures against approved documentation. Documents
          are untrusted evidence. Responses are returned as complete answers;
          token streaming is not supported by this endpoint.
        </div>
      </section>
      <aside className="panel retrieval-panel">
        <SectionHead title="Retrieval Intelligence" />
        <div>
          <label className="field">
            Response model
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="extractive">Cited excerpts · CPU</option>
              <option value="base">Base Transformers LLM</option>
              <option value="adapter">Fine-tuned adapter</option>
            </select>
          </label>
          <div className="two-columns">
            <label className="field">
              Top-k passages
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              >
                {[1, 2, 4, 6, 10].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Min. similarity
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </label>
          </div>
          <p className="chart-note">
            Lexical hashing is the default embedding baseline. Learned semantic
            retrieval requires configured model weights.
          </p>
          <Link
            href="/training"
            className="text-link"
            style={{ marginTop: 12 }}
          >
            Manage model adaptation
          </Link>
        </div>
        <div>
          {latest ? (
            <>
              <KeyValues
                values={{
                  response_mode: latest.mode,
                  embedding_mode: latest.embedding_mode,
                  latency_ms: latest.latency_ms,
                  evidence: latest.sufficient_evidence
                    ? "Sufficient"
                    : "Insufficient",
                }}
              />
              {latest.sources.map((s, i) => (
                <div key={s.chunk_id} className="retrieval-source">
                  <div className="section-head" style={{ marginBottom: 0 }}>
                    <strong>Source {i + 1}</strong>
                    <Badge>score {format(s.score, 3)}</Badge>
                  </div>
                  <p>{s.text}</p>
                  <code>
                    {s.filename}
                    {s.page ? ` · page ${s.page}` : ""}
                  </code>
                </div>
              ))}
            </>
          ) : (
            <div className="telemetry-empty" style={{ marginTop: 18 }}>
              Retrieved passages, raw similarity scores and measured response
              latency appear after a question. Similarity is not a probability
              of correctness.
            </div>
          )}
        </div>
      </aside>
      {confirm && (
        <ConfirmationDialog
          title="Delete this document?"
          onClose={() => setConfirm(null)}
          pending={remove.isPending}
          onConfirm={() => remove.mutate(confirm.id)}
        >
          Remove <strong>{confirm.filename}</strong> and its indexed passages.
          Upload the original file again to restore it.
          <ErrorNotice error={remove.error} />
        </ConfirmationDialog>
      )}
    </div>
  );
}
