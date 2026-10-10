import { useState } from "react";
import { CheckCircle2, Lightbulb, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { api, timeAgo } from "../api";
import { Badge, Empty, Glass, PageHeader, Skeleton, useAsync, useToast } from "../ui";

function GapCard({ g, onDone }: { g: any; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState(g.suggested_question);
  const [a, setA] = useState("");
  const [busy, setBusy] = useState<"draft" | "save" | null>(null);

  async function draft() {
    setBusy("draft");
    try { const d = await api("/api/gaps/draft", { body: { questions: g.questions } }); setQ(d.question); setA(d.answer || ""); if (!d.answer) toast("Offline mode: write the answer yourself, or add an API key for AI drafts"); }
    catch (e: any) { toast(e.message, false); } finally { setBusy(null); }
  }
  async function save() {
    setBusy("save");
    try { await api("/api/gaps/resolve", { body: { question: q, answer: a, message_ids: g.message_ids } }); toast("FAQ published — your agent can answer this now"); onDone(); }
    catch (e: any) { toast(e.message, false); setBusy(null); }
  }

  return (
    <Glass className="p-5 animate-rise">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="rose"><TrendingUp size={12} /> asked {g.count}×</Badge>
        <Badge tone={g.reason === "unanswered" ? "amber" : "slate"}>{g.reason}</Badge>
        <span className="ml-auto text-xs text-slate-500">last {timeAgo(g.last_seen)}</span>
      </div>
      <div className="mb-4 space-y-1">
        {g.questions.map((x: string) => <div key={x} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">“{x}”</div>)}
      </div>
      <div className="space-y-2.5 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recommended FAQ</span>
          <button className="btn btn-ghost !px-2.5 !py-1 !text-xs" onClick={draft} disabled={!!busy}>{busy === "draft" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Draft with AI</button></div>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        <textarea className="input min-h-[84px]" placeholder="Write the official answer…" value={a} onChange={(e) => setA(e.target.value)} />
        <button className="btn btn-primary w-full" disabled={!!busy || a.trim().length < 3} onClick={save}>{busy === "save" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Publish to knowledge base</button>
      </div>
    </Glass>
  );
}

export default function Gaps() {
  const { data, loading, reload } = useAsync(() => api<any[]>("/api/gaps"), []);
  return (
    <>
      <PageHeader title="Knowledge gaps" subtitle="Questions your agent couldn't answer, automatically clustered by meaning. Publish an FAQ to close the gap in one click." />
      {loading ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div> : !data?.length ? (
        <Empty icon={<Lightbulb size={26} />} title="No gaps detected" body="When customers ask things your documents don't cover, similar questions are grouped here with a suggested FAQ. Try asking something unrelated in the Playground." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{data.map((g) => <GapCard key={g.message_ids.join("-")} g={g} onDone={reload} />)}</div>
      )}
    </>
  );
}
