import { useState } from "react";
import { Check, Code2, Copy, ExternalLink, MessageCircle, Palette, Save, Send, X } from "lucide-react";
import { api } from "../api";
import { useMe } from "../App";
import { Glass, PageHeader, useAsync, useToast } from "../ui";

export default function Deploy() {
  const { me, refresh } = useMe();
  const toast = useToast();
  const snip = useAsync(() => api<{ snippet: string; origin: string }>("/api/snippet"), []);
  const [f, setF] = useState({ bot_name: me.bot_name, brand_color: me.brand_color, welcome: me.welcome, support_email: me.support_email, threshold: me.threshold });
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try { await api("/api/settings", { method: "PATCH", body: f }); refresh(); toast("Branding saved — the widget updates instantly"); }
    catch (e: any) { toast(e.message, false); } finally { setSaving(false); }
  }
  const copy = () => { navigator.clipboard.writeText(snip.data?.snippet || ""); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const c = f.brand_color;

  return (
    <>
      <PageHeader title="Deploy & brand" subtitle="Customize the chat widget, then paste one line of code on any website." />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Glass className="p-5">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Code2 size={16} className="text-blue-600" /> One-click install</h3>
            <p className="mb-3 text-sm text-slate-500">Paste this before the closing <code className="rounded bg-slate-100 px-1">&lt;/body&gt;</code> tag. It loads in a sandboxed Shadow DOM so it never conflicts with your site's styles.</p>
            <div className="relative">
              <pre className="scroll overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 pr-24 text-xs text-blue-800">{snip.data?.snippet || "…"}</pre>
              <button onClick={copy} className="btn btn-ghost absolute right-2 top-2 !py-1.5 !text-xs">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}</button>
            </div>
            <a className="btn btn-ghost mt-3" target="_blank" rel="noreferrer" href={`/demo-site?bot=${me.bot_id}`}><ExternalLink size={16} /> Open demo storefront with your bot</a>
          </Glass>

          <Glass className="space-y-4 p-5">
            <h3 className="flex items-center gap-2 font-semibold text-slate-900"><Palette size={16} className="text-blue-600" /> Branding & behaviour</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-slate-700">Assistant name<input className="input mt-1" maxLength={40} value={f.bot_name} onChange={(e) => setF({ ...f, bot_name: e.target.value })} /></label>
              <label className="block text-sm text-slate-700">Brand color
                <div className="mt-1 flex gap-2"><input type="color" className="h-[42px] w-14 cursor-pointer rounded-xl border border-slate-200 bg-transparent p-1" value={c} onChange={(e) => setF({ ...f, brand_color: e.target.value })} /><input className="input" value={c} onChange={(e) => setF({ ...f, brand_color: e.target.value })} /></div></label>
            </div>
            <label className="block text-sm text-slate-700">Welcome message<textarea className="input mt-1" rows={2} maxLength={240} value={f.welcome} onChange={(e) => setF({ ...f, welcome: e.target.value })} /></label>
            <label className="block text-sm text-slate-700">Support email<input className="input mt-1" value={f.support_email} onChange={(e) => setF({ ...f, support_email: e.target.value })} /></label>
            <div>
              <div className="mb-1 flex justify-between text-sm text-slate-700"><span>Confidence threshold</span><b className="text-slate-900">{Math.round(f.threshold * 100)}%</b></div>
              <input type="range" min={0.2} max={0.8} step={0.05} className="w-full accent-blue-500" value={f.threshold} onChange={(e) => setF({ ...f, threshold: +e.target.value })} />
              <p className="mt-1 text-xs text-slate-500">Below this retrieval confidence the agent refuses to answer and offers a human. Higher = safer, lower = answers more.</p>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={saving}><Save size={16} /> Save changes</button>
          </Glass>
        </div>

        <div className="lg:col-span-2">
          <div className="sticky top-2">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Live preview</div>
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 p-4" style={{ background: "#eff6ff" }}>
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full blur-3xl" style={{ background: c, opacity: 0.35 }} />
              <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center gap-3 p-4 text-white" style={{ background: `linear-gradient(135deg, ${c}, ${c}bb)` }}>
                  <div className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white/20 font-bold">{(f.bot_name || "S")[0].toUpperCase()}</div>
                  <div className="flex-1"><div className="text-sm font-bold">{f.bot_name}</div><div className="text-xs opacity-85">● Answers from {me.name} docs</div></div>
                  <X size={16} />
                </div>
                <div className="space-y-3 bg-slate-50 p-4 text-sm text-slate-800">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">{f.welcome}</div>
                  <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm px-3 py-2 text-white" style={{ background: c }}>How long does shipping take?</div>
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-sm">Standard shipping takes 3-5 business days.
                    <div className="mt-2"><span className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: c + "55", background: c + "1a", color: c }}>1 · shipping_policy.md</span></div></div>
                </div>
                <div className="flex gap-2 border-t border-slate-200/60 bg-white p-3"><div className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">Type your question…</div><div className="grid w-10 place-items-center rounded-xl text-white" style={{ background: c }}><Send size={16} /></div></div>
              </div>
              <div className="relative mt-4 flex justify-end"><div className="grid h-14 w-14 place-items-center rounded-full text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${c}, ${c}99)`, boxShadow: `0 10px 28px ${c}77` }}><MessageCircle /></div></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
