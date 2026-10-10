import { Link } from "react-router-dom";
import { Activity, ArrowRight, BookOpen, Clock, Gauge, Inbox, MessageSquare, ShieldCheck, ThumbsUp, UserRoundCheck } from "lucide-react";
import { api, fmtMs, fmtPct } from "../api";
import { Empty, Glass, Meter, PageHeader, Skeleton, Stat, useAsync } from "../ui";
import { useMe } from "../App";

function Trend({ series }: { series: { date: string; questions: number; answered: number }[] }) {
  if (!series.length) return <div className="grid h-48 place-items-center text-sm text-slate-500">No conversations yet</div>;
  const W = 640, H = 190, P = 28;
  const max = Math.max(1, ...series.map((s) => s.questions));
  const step = series.length > 1 ? (W - P * 2) / (series.length - 1) : 0;
  const x = (i: number) => (series.length > 1 ? P + i * step : W / 2);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = (k: "questions" | "answered") => series.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s[k])}`).join(" ");
  const area = `${line("questions")} L${x(series.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Questions per day">
      <defs>
        <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".5" /><stop offset="100%" stopColor="#2563eb" stopOpacity="0" /></linearGradient>
      </defs>
      {[0, 0.5, 1].map((t) => <line key={t} x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="rgba(255,255,255,.08)" />)}
      <path d={area} fill="url(#g1)" />
      <path d={line("questions")} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
      <path d={line("answered")} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="5 4" />
      {series.map((s, i) => (
        <g key={s.date}>
          <circle cx={x(i)} cy={y(s.questions)} r="4" fill="#2563eb" />
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">{s.date.slice(5)}</text>
          <title>{`${s.date}: ${s.questions} questions, ${s.answered} answered`}</title>
        </g>
      ))}
    </svg>
  );
}

export default function Overview() {
  const { me } = useMe();
  const { data: a, loading } = useAsync(() => api<any>("/api/analytics"), []);

  if (loading || !a) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>;
  if (!a.documents)
    return (
      <>
        <PageHeader title={`Welcome, ${me.name}`} subtitle="Let's get your support agent live in three steps." />
        <Empty icon={<BookOpen size={28} />} title="Add your first knowledge source" body="Upload PDFs, DOCX or FAQs, or paste a URL. Or load the sample Northwind Outfitters data to explore instantly." action={<Link to="/knowledge" className="btn btn-primary">Go to Knowledge <ArrowRight size={16} /></Link>} />
      </>
    );

  return (
    <>
      <PageHeader title="Overview" subtitle="How your AI support agent is performing in real time." actions={<Link to="/playground" className="btn btn-primary"><MessageSquare size={16} /> Test your agent</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Questions" value={a.questions} hint={`${a.conversations} conversations`} icon={<MessageSquare size={16} />} />
        <Stat label="Answer rate" value={fmtPct(a.answer_rate)} hint={`${fmtPct(a.fallback_rate)} escalated to humans`} icon={<Activity size={16} />} tone="emerald" />
        <Stat label="Avg groundedness" value={fmtPct(a.avg_groundedness)} hint={a.hallucination_risk == null ? "No answers yet" : `${fmtPct(a.hallucination_risk)} weakly-grounded answers`} icon={<ShieldCheck size={16} />} tone="cyan" />
        <Stat label="Satisfaction" value={fmtPct(a.satisfaction)} hint={`👍 ${a.thumbs_up}  ·  👎 ${a.thumbs_down}`} icon={<ThumbsUp size={16} />} tone="amber" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Glass className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Questions per day</h3>
            <div className="flex gap-4 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Asked</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Answered</span></div>
          </div>
          <Trend series={a.series} />
        </Glass>
        <Glass className="space-y-4 p-5">
          <h3 className="font-semibold text-slate-900">Quality & speed</h3>
          {[
            ["Avg retrieval confidence", fmtPct(a.avg_confidence), a.avg_confidence ?? 0, "#2563eb"],
            ["Answer rate", fmtPct(a.answer_rate), a.answer_rate ?? 0, "#10b981"],
            ["Groundedness", fmtPct(a.avg_groundedness), a.avg_groundedness ?? 0, "#0ea5e9"],
          ].map(([l, v, n, c]) => (
            <div key={l as string}>
              <div className="mb-1 flex justify-between text-sm"><span className="text-slate-500">{l}</span><b className="text-slate-900">{v}</b></div>
              <Meter value={n as number} color={c as string} />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-slate-100 p-3"><Clock size={14} className="text-slate-500" /><div className="mt-1 text-lg font-bold text-slate-900">{fmtMs(a.latency_avg_ms)}</div><div className="text-xs text-slate-500">avg response</div></div>
            <div className="rounded-xl bg-slate-100 p-3"><Gauge size={14} className="text-slate-500" /><div className="mt-1 text-lg font-bold text-slate-900">{fmtMs(a.latency_p95_ms)}</div><div className="text-xs text-slate-500">p95 response</div></div>
          </div>
        </Glass>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Documents" value={a.documents} hint={`${a.chunks} searchable passages`} icon={<BookOpen size={16} />} />
        <Stat label="Avg retrieval time" value={fmtMs(a.retrieval_avg_ms)} hint="hybrid search + rerank" icon={<Gauge size={16} />} tone="cyan" />
        <Link to="/handoffs"><Stat label="Open hand-offs" value={a.open_handoffs} hint="customers waiting for a human" icon={a.open_handoffs ? <UserRoundCheck size={16} /> : <Inbox size={16} />} tone={a.open_handoffs ? "rose" : "slate"} /></Link>
      </div>
    </>
  );
}
