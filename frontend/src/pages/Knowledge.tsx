import { DragEvent, useRef, useState } from "react";
import { BookOpen, FileText, Globe, HelpCircle, Loader2, PlusCircle, Sparkles, Trash2, UploadCloud, Eye } from "lucide-react";
import { api, timeAgo } from "../api";
import { Badge, Empty, Glass, Modal, PageHeader, Skeleton, useAsync, useToast } from "../ui";

const icons: Record<string, any> = { pdf: FileText, docx: FileText, text: FileText, html: Globe, url: Globe, faq: HelpCircle };

export default function Knowledge() {
  const toast = useToast();
  const { data: docs, loading, reload } = useAsync(() => api<any[]>("/api/documents"), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [url, setUrl] = useState("");
  const [faq, setFaq] = useState({ question: "", answer: "" });
  const [faqOpen, setFaqOpen] = useState(false);
  const [preview, setPreview] = useState<{ name: string; chunks: any[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy("Reading, chunking and embedding your documents…");
    const form = new FormData();
    list.forEach((f) => form.append("files", f));
    try {
      const res = await api<any[]>("/api/documents/upload", { form });
      res.forEach((r) => (r.ok ? toast(`Indexed ${r.name}`) : toast(`${r.name}: ${r.error}`, false)));
      reload();
    } catch (e: any) {
      toast(e.message, false);
    } finally {
      setBusy(null);
    }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); };

  async function run(label: string, fn: () => Promise<any>, ok: string) {
    setBusy(label);
    try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message, false); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader
        title="Knowledge base"
        subtitle="Everything your agent knows. Documents are cleaned, split into passages with page and section metadata, and indexed for hybrid search."
        actions={
          <>
            <button className="btn btn-ghost" onClick={() => setFaqOpen(true)}><PlusCircle size={16} /> Add FAQ</button>
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("Loading sample data…", () => api("/api/knowledge/sample", { method: "POST" }), "Sample knowledge base loaded")}><Sparkles size={16} /> Load sample data</button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Glass
          className={`flex cursor-pointer flex-col items-center justify-center p-8 text-center transition lg:col-span-2 ${drag ? "!border-blue-500 !bg-blue-50" : ""}`}
        >
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => file.current?.click()} className="w-full">
            <input ref={file} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.html,.htm,.csv" onChange={(e) => e.target.files && upload(e.target.files)} />
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-slate-100 text-blue-600">
              {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            </div>
            <h3 className="font-semibold text-slate-900">{busy || "Drop files here or click to browse"}</h3>
            <p className="mt-1 text-sm text-slate-500">PDF, DOCX, TXT, Markdown or HTML · up to 15 MB each</p>
          </div>
        </Glass>
        <Glass className="p-5">
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-slate-900"><Globe size={16} className="text-blue-600" /> Import from a URL</h3>
          <p className="mb-3 text-sm text-slate-500">Help center, FAQ page or policy page.</p>
          <input className="input" placeholder="https://example.com/help" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary mt-3 w-full" disabled={!url.trim() || !!busy} onClick={() => run("Fetching page…", async () => { await api("/api/documents/url", { body: { url } }); setUrl(""); }, "Page imported")}>Import page</button>
        </Glass>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Sources {docs ? <span className="text-slate-500">({docs.length})</span> : null}</h2>
      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : !docs?.length ? (
        <Empty icon={<BookOpen size={26} />} title="No sources yet" body="Upload a document or load the sample data to see citations in action." />
      ) : (
        <div className="space-y-3">
          {docs.map((d) => {
            const Icon = icons[d.source_type] || FileText;
            return (
              <Glass key={d.id} className="glass-hover flex items-center gap-4 px-4 py-3.5">
                <div className="rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-blue-600"><Icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-slate-900">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.chunk_count} passages · {timeAgo(d.created_at)}{d.error ? ` · ${d.error}` : ""}</div>
                </div>
                <Badge tone={d.status === "ready" ? "emerald" : "rose"}>{d.status === "ready" ? d.source_type.toUpperCase() : "Failed"}</Badge>
                <button className="btn btn-ghost !p-2" aria-label="Preview passages" onClick={async () => setPreview({ name: d.name, chunks: await api(`/api/documents/${d.id}/chunks`) })}><Eye size={16} /></button>
                <button className="btn btn-danger !p-2" aria-label="Delete" onClick={() => run("Deleting…", () => api(`/api/documents/${d.id}`, { method: "DELETE" }), "Removed")}><Trash2 size={16} /></button>
              </Glass>
            );
          })}
        </div>
      )}

      <Modal open={faqOpen} onClose={() => setFaqOpen(false)} title="Add an FAQ entry">
        <div className="space-y-3">
          <input className="input" placeholder="Question" value={faq.question} onChange={(e) => setFaq({ ...faq, question: e.target.value })} />
          <textarea className="input min-h-[120px]" placeholder="Answer" value={faq.answer} onChange={(e) => setFaq({ ...faq, answer: e.target.value })} />
          <button className="btn btn-primary w-full" disabled={faq.question.length < 3 || faq.answer.length < 3} onClick={async () => { setFaqOpen(false); await run("Adding FAQ…", () => api("/api/documents/faq", { body: faq }), "FAQ added"); setFaq({ question: "", answer: "" }); }}>Add to knowledge base</button>
        </div>
      </Modal>
      <Modal wide open={!!preview} onClose={() => setPreview(null)} title={preview ? `Passages · ${preview.name}` : ""}>
        <div className="space-y-3">
          {preview?.chunks.map((c, i) => (
            <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-100 p-3">
              <div className="mb-1 flex gap-2 text-xs"><Badge tone="indigo">#{i + 1}</Badge>{c.page && <Badge>Page {c.page}</Badge>}{c.section && <Badge tone="cyan">{c.section}</Badge>}</div>
              <p className="text-sm leading-relaxed text-slate-700">{c.text}</p>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
