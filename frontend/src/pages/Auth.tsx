import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileCheck2, Lock, Quote, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { api, setToken } from "../api";
import { Aurora } from "../ui";

export default function Auth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ token: string }>(signup ? "/api/auth/register" : "/api/auth/login", { body: f });
      setToken(r.token);
      nav("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const perks = [
    [FileCheck2, "Cited answers", "Every reply links to the exact document and page"],
    [ShieldCheck, "Never makes things up", "Weak evidence triggers human hand-off"],
    [Zap, "One-line install", "Paste a script tag and your bot is live"],
  ] as const;

  return (
    <div className="relative grid min-h-full place-items-center p-4">
      <Aurora />
      <div className="relative z-10 grid w-full max-w-5xl gap-6 md:grid-cols-2">
        <div className="hidden flex-col justify-center md:flex">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-lg shadow-blue-600/40"><Sparkles className="text-white" /></div>
            <span className="text-2xl font-extrabold text-slate-900">SupportAI</span>
          </div>
          <h1 className="text-4xl font-extrabold leading-tight text-slate-900">Customer support you can <span className="bg-gradient-to-r from-blue-600 to-blue-600 bg-clip-text text-transparent">actually trust</span>.</h1>
          <p className="mt-4 text-slate-500">Turn your documents into an evidence-grounded AI agent with hybrid retrieval, source citations, and built-in evaluation.</p>
          <ul className="mt-8 space-y-4">
            {perks.map(([Icon, t, d]) => (
              <li key={t} className="flex items-start gap-3">
                <span className="glass rounded-xl p-2 text-blue-600"><Icon size={18} /></span>
                <span><b className="block text-slate-800">{t}</b><span className="text-sm text-slate-500">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={submit} className="glass-strong animate-rise rounded-3xl p-8">
          <h2 className="text-2xl font-bold text-slate-900">{signup ? "Create your workspace" : "Welcome back"}</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">{signup ? "Each business gets an isolated, private workspace." : "Sign in to manage your support agent."}</p>
          <div className="space-y-4">
            {signup && (
              <label className="block text-sm text-slate-700">Business name
                <input className="input mt-1" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Northwind Outfitters" />
              </label>
            )}
            <label className="block text-sm text-slate-700">Email
              <input className="input mt-1" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="you@company.com" />
            </label>
            <label className="block text-sm text-slate-700">Password
              <input className="input mt-1" type="password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 6 characters" />
            </label>
          </div>
          {err && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}
          <button className="btn btn-primary mt-6 w-full !py-3" disabled={busy}><Lock size={16} /> {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
          <p className="mt-5 text-center text-sm text-slate-500">
            {signup ? "Already have an account?" : "New to SupportAI?"}{" "}
            <Link className="font-semibold text-blue-600 hover:underline" to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create a workspace"}</Link>
          </p>
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs text-slate-500"><Quote size={14} className="mt-0.5 shrink-0" /> Tip: after signing up, click “Load sample data” in Knowledge to try everything in seconds.</div>
        </form>
      </div>
    </div>
  );
}
