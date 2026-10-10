import { useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, Play, Plus, Trash2, XCircle } from "lucide-react";
import { api, fmtMs, fmtPct, timeAgo } from "../api";
import { Badge, Empty, Glass, Meter, PageHeader, Skeleton, Stat, useAsync, useToast } from "../ui";

function Compare({ label, base, hybrid }: { label: string; base: number | null; hybrid: number | null }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-800">{label}</div>
      <div className="space-y-2">
        <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>Vector search only (baseline)</span><b>{fmtPct(base)}</b></div><Meter value={base ?? 0} color="#64748b" /></div>
        <div><div className="mb-1 flex justify-between text-xs text-slate-500"><span>SupportAI hybrid + rerank</span><b className="text-slate-900">{fmtPct(hybrid)}</b></div><Meter value={hybrid ?? 0} color="#2563eb" /></div>
      </div>
    </div>
  );
}

export default function Evaluation() {
  const toast = useToast();
  const golden = useAsync(() => api<any[]>("/api/golden"), []);
  const runs = useAsync(() => api<any[]>("/api/eval/runs"), []);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ question: "", expected_answer: "", answerable: true });

  async function run() {
    setRunning(true);
    try { await api("/api/eval/run", { method: "POST" }); runs.reload(); toast("Evaluation complete"); }
    catch (e: any) { toast(e.message, false); } finally { setRunning(false); }
  }
  async function add() {
    try { await api("/api/golden", { body: form }); setForm({ question: "", expected_answer: "", answerable: true }); golden.reload(); }
    catch (e: any) { toast(e.message, false); }
  }

  const latest = runs.data?.[0];
  const m = latest?.metrics;

  return (
    <>
      <PageHeader
        title="Evaluation"
        subtitle="Regression-test your agent against a golden Q&A set. Measures retrieval accuracy, answer correctness, groundedness, hallucinations and latency."
        actions={<button className="btn btn-primary" onClick={run} disabled={running || !golden.data?.length}>{running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {running ? "Running…" : "Run evaluation"}</button>}
      />

      {runs.loading ? <Skeleton className="h-40" /> : !m ? (
        <Empty icon={<FlaskConical size={26} />} title="No evaluation runs yet" body={golden.data?.length ? "Run the evaluation to score your agent on the golden set below." : "Add golden questions below, or load the sample data from Knowledge."} />
      ) : (
        <>
          <div className="mb-1 text-xs text-slate-500">Latest run · {timeAgo(latest.created_at)} · {m.questions} questions · judge: {m.judge}</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Retrieval hit@3" value={fmtPct(m.retrieval_hit_at_3)} hint="right passage in top 3" tone="indigo" />
            <Stat label="Answer accuracy" value={fmtPct(m.answer_accuracy)} hint="matches expected facts" tone="emerald" />
            <Stat label="Groundedness" value={fmtPct(m.groundedness)} hint="claims backed by sources" tone="cyan" />
            <Stat label="Hallucination rate" value={fmtPct(m.hallucination_rate, 1)} hint="lower is better" tone={m.hallucination_rate > 0.1 ? "rose" : "emerald"} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Glass className="p-5 lg:col-span-2">
              <h3 className="mb-4 font-semibold text-slate-900">Why hybrid retrieval?</h3>
              <Compare label="Retrieval hit@3" base={m.baseline_hit_at_3} hybrid={m.retrieval_hit_at_3} />
            </Glass>
            <Glass className="space-y-3 p-5">
              <h3 className="font-semibold text-slate-900">Safety & speed</h3>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Correct fallback on out-of-scope</span><b className="text-slate-900">{fmtPct(m.fallback_accuracy)}</b></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Latency p50</span><b className="text-slate-900">{fmtMs(m.latency_p50_ms)}</b></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Latency p95</span><b className="text-slate-900">{fmtMs(m.latency_p95_ms)}</b></div>
            </Glass>
          </div>
          <Glass className="mt-4 overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-900">Per-question results</div>
            <div className="scroll max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-2">Question</th><th className="px-2">Type</th><th className="px-2">Conf</th><th className="px-2">Grounded</th><th className="px-2">Time</th><th className="pr-5 text-right">Result</th></tr></thead>
                <tbody>
                  {latest.details.map((d: any) => (
                    <tr key={d.id} className="border-t border-slate-200 align-top">
                      <td className="px-5 py-2.5"><div className="text-slate-800">{d.question}</div><div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{d.answer}</div></td>
                      <td className="px-2 py-2.5"><Badge tone={d.answerable ? "indigo" : "amber"}>{d.answerable ? "in scope" : "out of scope"}</Badge></td>
                      <td className="px-2 py-2.5 text-slate-700">{fmtPct(d.confidence)}</td>
                      <td className="px-2 py-2.5 text-slate-700">{fmtPct(d.grounded)}</td>
                      <td className="px-2 py-2.5 text-slate-500">{fmtMs(d.latency_ms)}</td>
                      <td className="pr-5 text-right">{d.passed ? <CheckCircle2 size={18} className="ml-auto text-emerald-500" /> : <XCircle size={18} className="ml-auto text-rose-500" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Glass>
        </>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Golden question set <span className="text-slate-500">({golden.data?.length ?? 0})</span></h2>
      <Glass className="mb-3 grid gap-3 p-4 md:grid-cols-[1fr_1.4fr_auto_auto]">
        <input className="input" placeholder="Question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} />
        <input className="input" placeholder={form.answerable ? "Expected answer" : "(none — should fall back)"} disabled={!form.answerable} value={form.expected_answer} onChange={(e) => setForm({ ...form, expected_answer: e.target.value })} />
        <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-700"><input type="checkbox" checked={form.answerable} onChange={(e) => setForm({ ...form, answerable: e.target.checked })} /> In scope</label>
        <button className="btn btn-ghost" disabled={form.question.length < 3} onClick={add}><Plus size={16} /> Add</button>
      </Glass>
      <div className="space-y-2">
        {golden.data?.map((g) => (
          <Glass key={g.id} className="flex items-center gap-3 px-4 py-2.5">
            <Badge tone={g.answerable ? "indigo" : "amber"}>{g.answerable ? "in scope" : "out of scope"}</Badge>
            <div className="min-w-0 flex-1"><div className="truncate text-sm text-slate-800">{g.question}</div>{g.expected_answer && <div className="truncate text-xs text-slate-500">{g.expected_answer}</div>}</div>
            <button className="btn btn-danger !p-1.5" aria-label="Delete" onClick={async () => { await api(`/api/golden/${g.id}`, { method: "DELETE" }); golden.reload(); }}><Trash2 size={14} /></button>
          </Glass>
        ))}
      </div>
    </>
  );
}
