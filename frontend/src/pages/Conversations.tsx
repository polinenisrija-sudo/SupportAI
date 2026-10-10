import { useState } from "react";
import { Bot, MessagesSquare, User } from "lucide-react";
import { api, fmtMs, fmtPct, timeAgo } from "../api";
import { Badge, Empty, Glass, PageHeader, Skeleton, useAsync } from "../ui";

export default function Conversations() {
  const { data: list, loading } = useAsync(() => api<any[]>("/api/conversations"), []);
  const [active, setActive] = useState<number | null>(null);
  const [thread, setThread] = useState<any[]>([]);

  async function open(id: number) {
    setActive(id);
    setThread(await api(`/api/conversations/${id}`));
  }

  if (loading) return <Skeleton className="h-64" />;
  return (
    <>
      <PageHeader title="Conversations" subtitle="Full history of what customers asked and how the agent answered." />
      {!list?.length ? (
        <Empty icon={<MessagesSquare size={26} />} title="No conversations yet" body="Chat in the Playground or embed the widget on a site and conversations will appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="scroll max-h-[calc(100vh-12rem)] space-y-2 overflow-y-auto lg:col-span-2">
            {list.map((c) => (
              <button key={c.id} onClick={() => open(c.id)} className={`glass glass-hover w-full rounded-2xl p-4 text-left ${active === c.id ? "!border-blue-500/60" : ""}`}>
                <div className="line-clamp-2 text-sm font-medium text-slate-900">{c.first_question}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <Badge tone={c.source === "widget" ? "cyan" : "slate"}>{c.source}</Badge>
                  <span>{Math.ceil(c.messages / 2)} turns</span>
                  {c.escalations > 0 && <Badge tone="amber">{c.escalations} escalated</Badge>}
                  <span className="ml-auto">{timeAgo(c.last_at)}</span>
                </div>
              </button>
            ))}
          </div>
          <Glass className="scroll max-h-[calc(100vh-12rem)] overflow-y-auto p-5 lg:col-span-3">
            {!active ? <p className="py-20 text-center text-sm text-slate-500">Select a conversation to read it.</p> : (
              <div className="space-y-4">
                {thread.map((m) => (
                  <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${m.role === "user" ? "bg-slate-100" : "bg-gradient-to-br from-blue-600 to-blue-700"}`}>{m.role === "user" ? <User size={16} /> : <Bot size={16} className="text-white" />}</div>
                    <div className={`max-w-[85%] ${m.role === "user" ? "text-right" : ""}`}>
                      <div className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm ${m.role === "user" ? "bg-blue-600 text-white" : m.answered ? "glass text-slate-800" : "border border-amber-300 bg-amber-50 text-amber-900"}`}>{m.content}</div>
                      {m.role === "assistant" && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                          {m.citations.map((c: any) => <Badge key={c.n} tone="indigo">{c.doc}{c.page ? ` p.${c.page}` : ""}</Badge>)}
                          <span>conf {fmtPct(m.confidence)}</span><span>· {fmtMs(m.latency_ms)}</span>
                          {m.feedback === 1 && <span>· 👍</span>}{m.feedback === -1 && <span>· 👎</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Glass>
        </div>
      )}
    </>
  );
}
