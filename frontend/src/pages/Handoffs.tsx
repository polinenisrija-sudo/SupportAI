import { CheckCircle2, Inbox, Mail, RotateCcw } from "lucide-react";
import { api, timeAgo } from "../api";
import { Badge, Empty, Glass, PageHeader, Skeleton, useAsync } from "../ui";

export default function Handoffs() {
  const { data, loading, reload } = useAsync(() => api<any[]>("/api/handoffs"), []);
  const set = async (id: number, status: string) => { await api(`/api/handoffs/${id}`, { method: "PATCH", body: { status } }); reload(); };
  return (
    <>
      <PageHeader title="Human inbox" subtitle="Customers the agent couldn't confidently help. Reply by email, then mark them resolved." />
      {loading ? <Skeleton className="h-40" /> : !data?.length ? (
        <Empty icon={<Inbox size={26} />} title="Inbox zero" body="When the agent isn't confident and a customer asks for a human in the chat widget, the request lands here." />
      ) : (
        <div className="space-y-3">
          {data.map((h) => (
            <Glass key={h.id} className="p-5 animate-rise">
              <div className="flex flex-wrap items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 font-semibold text-slate-900">{(h.name || h.email || "?").charAt(0).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{h.name || "Anonymous"}</div>
                  <a href={`mailto:${h.email}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"><Mail size={13} /> {h.email || "no email"}</a>
                </div>
                <Badge tone={h.status === "open" ? "amber" : "emerald"}>{h.status}</Badge>
                <span className="text-xs text-slate-500">{timeAgo(h.created_at)}</span>
                {h.status === "open"
                  ? <button className="btn btn-ghost" onClick={() => set(h.id, "resolved")}><CheckCircle2 size={16} /> Resolve</button>
                  : <button className="btn btn-ghost" onClick={() => set(h.id, "open")}><RotateCcw size={16} /> Reopen</button>}
              </div>
              {h.last_question && <div className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700"><span className="text-slate-500">Last question: </span>“{h.last_question}”</div>}
              {h.message && <div className="mt-2 text-sm text-slate-500">“{h.message}”</div>}
            </Glass>
          ))}
        </div>
      )}
    </>
  );
}
