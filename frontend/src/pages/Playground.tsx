import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Clock, FileText, Gauge, Send, ShieldCheck, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { ChatResult, api, fmtMs, fmtPct } from "../api";
import { Badge, Glass, Meter, PageHeader, useToast } from "../ui";

type Msg = { role: "user" | "bot"; text: string; res?: ChatResult; vote?: number };

const SUGGESTIONS = ["How much is standard shipping?", "Can I return a used sleeping bag?", "How do I wash a down sleeping bag?", "Do you offer gift wrapping?"];

export default function Playground() {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<ChatResult | null>(null);
  const session = useRef("pg" + Math.random().toString(36).slice(2, 10));
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    setText("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api<ChatResult>("/api/chat", { body: { message: q, session_id: session.current } });
      setMsgs((m) => [...m, { role: "bot", text: res.answer, res }]);
      setSel(res);
    } catch (e: any) {
      toast(e.message, false);
    } finally {
      setBusy(false);
    }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); send(text); };

  async function vote(i: number, v: number) {
    const res = msgs[i].res!;
    setMsgs((m) => m.map((x, j) => (j === i ? { ...x, vote: v } : x)));
    await api("/api/feedback", { body: { message_id: res.message_id, value: v } }).catch(() => {});
  }

  const conf = sel?.confidence ?? 0;
  const confColor = !sel ? "#2563eb" : sel.answered ? "#10b981" : "#ef4444";

  return (
    <>
      <PageHeader title="Playground" subtitle="Chat with your agent exactly as customers will. The right panel shows the evidence behind every answer." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Glass className="flex h-[calc(100vh-13rem)] min-h-[480px] flex-col overflow-hidden lg:col-span-3">
          <div className="scroll flex-1 space-y-4 overflow-y-auto p-5">
            {!msgs.length && (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/40"><Bot className="text-white" /></div>
                  <p className="text-slate-700">Ask anything your documents cover — or something they don't.</p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {SUGGESTIONS.map((s) => <button key={s} className="btn btn-ghost !text-xs" onClick={() => send(s)}>{s}</button>)}
                  </div>
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex gap-3 animate-rise ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${m.role === "user" ? "bg-slate-100" : "bg-gradient-to-br from-blue-600 to-blue-700"}`}>{m.role === "user" ? <User size={16} /> : <Bot size={16} className="text-white" />}</div>
                <div className={`max-w-[85%] ${m.role === "user" ? "text-right" : ""}`}>
                  <div
                    onClick={() => m.res && setSel(m.res)}
                    className={`inline-block cursor-default whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm leading-relaxed ${m.role === "user" ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white" : m.res && !m.res.answered ? "border border-amber-300 bg-amber-50 text-amber-900" : "glass text-slate-800"}`}
                  >
                    {m.res && !m.res.answered && <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700"><AlertTriangle size={14} /> Low-confidence · human fallback</div>}
                    {m.text}
                  </div>
                  {m.res && m.res.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.res.citations.map((c) => (
                        <button key={c.n} onClick={() => setSel(m.res!)} className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50">
                          <FileText size={12} /> {c.doc}{c.page ? ` · p.${c.page}` : ""}{c.section ? ` · ${c.section}` : ""}
                        </button>
                      ))}
                    </div>
                  )}
                  {m.res?.answered && (
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => vote(i, 1)} className={`btn btn-ghost !p-1.5 ${m.vote === 1 ? "!border-emerald-500/60 !bg-emerald-50" : ""}`} aria-label="Helpful"><ThumbsUp size={14} /></button>
                      <button onClick={() => vote(i, -1)} className={`btn btn-ghost !p-1.5 ${m.vote === -1 ? "!border-rose-500/60 !bg-rose-50" : ""}`} aria-label="Not helpful"><ThumbsDown size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex gap-3"><div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700"><Bot size={16} className="text-white" /></div><div className="glass dotty rounded-2xl px-4 py-3"><i /><i /><i /></div></div>}
            <div ref={end} />
          </div>
          <form onSubmit={submit} className="flex gap-2 border-t border-slate-200 p-3">
            <input className="input" placeholder="Ask a customer question…" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
            <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
          </form>
        </Glass>

        <div className="space-y-4 lg:col-span-2">
          <Glass className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck size={16} className="text-emerald-600" /> Answer diagnostics</h3>
            {!sel ? <p className="text-sm text-slate-500">Send a message to inspect retrieval confidence, grounding and latency.</p> : (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 flex justify-between text-sm"><span className="text-slate-500">Retrieval confidence</span><b className="text-slate-900">{fmtPct(conf)}</b></div>
                  <Meter value={conf} color={confColor} />
                  <div className="mt-1.5">{sel.answered ? <Badge tone="emerald">Answered from evidence</Badge> : <Badge tone="amber">Below threshold → escalate</Badge>}</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-100 p-2.5"><Gauge size={14} className="mx-auto text-slate-500" /><div className="font-bold text-slate-900">{fmtPct(sel.grounded)}</div><div className="text-[11px] text-slate-500">grounded</div></div>
                  <div className="rounded-xl bg-slate-100 p-2.5"><Clock size={14} className="mx-auto text-slate-500" /><div className="font-bold text-slate-900">{fmtMs(sel.latency_ms)}</div><div className="text-[11px] text-slate-500">total</div></div>
                  <div className="rounded-xl bg-slate-100 p-2.5"><Clock size={14} className="mx-auto text-slate-500" /><div className="font-bold text-slate-900">{fmtMs(sel.retrieval_ms)}</div><div className="text-[11px] text-slate-500">retrieval</div></div>
                </div>
              </div>
            )}
          </Glass>
          <Glass className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-slate-900"><FileText size={16} className="text-blue-600" /> Retrieved evidence</h3>
            {!sel?.retrieved?.length ? <p className="text-sm text-slate-500">Top passages after hybrid search + reranking appear here.</p> : (
              <div className="scroll max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {sel.retrieved.map((c) => {
                  const used = sel.citations.some((x) => x.doc_id === c.doc_id && x.snippet === c.snippet);
                  return (
                    <div key={c.n} className={`rounded-xl border p-3 ${used ? "border-blue-500/40 bg-blue-50" : "border-slate-200 bg-slate-100"}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge tone={used ? "indigo" : "slate"}>{used ? "cited" : `#${c.n}`}</Badge>
                        <span className="font-medium text-slate-800">{c.doc}</span>
                        {c.page && <span className="text-slate-500">p.{c.page}</span>}
                        <span className="ml-auto text-slate-500">rerank {c.score}</span>
                      </div>
                      {c.section && <div className="mb-1 text-xs text-blue-600">{c.section}</div>}
                      <p className="text-xs leading-relaxed text-slate-700">{c.snippet}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Glass>
        </div>
      </div>
    </>
  );
}
