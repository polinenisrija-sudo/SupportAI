import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import {
  BookOpen, FlaskConical, Inbox, LayoutDashboard, LogOut, Menu, MessageCircle, MessagesSquare, Rocket, Sparkles, Lightbulb,
} from "lucide-react";
import { Me, api, getToken, setToken } from "./api";
import { Aurora, Badge } from "./ui";
import Auth from "./pages/Auth";
import Overview from "./pages/Overview";
import Knowledge from "./pages/Knowledge";
import Playground from "./pages/Playground";
import Conversations from "./pages/Conversations";
import Gaps from "./pages/Gaps";
import Evaluation from "./pages/Evaluation";
import Handoffs from "./pages/Handoffs";
import Deploy from "./pages/Deploy";

const MeCtx = createContext<{ me: Me; refresh: () => void }>(null as any);
export const useMe = () => useContext(MeCtx);

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/playground", label: "Playground", icon: MessageCircle },
  { to: "/conversations", label: "Conversations", icon: MessagesSquare },
  { to: "/gaps", label: "Knowledge Gaps", icon: Lightbulb },
  { to: "/evaluation", label: "Evaluation", icon: FlaskConical },
  { to: "/handoffs", label: "Human Inbox", icon: Inbox },
  { to: "/deploy", label: "Deploy & Brand", icon: Rocket },
];

function Shell() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const load = () => api<Me>("/api/me").then(setMe).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!getToken()) return <Navigate to="/login" replace />;
  if (!me) return <div className="grid h-full place-items-center text-slate-500"><Aurora />Loading…</div>;

  return (
    <MeCtx.Provider value={{ me, refresh: load }}>
      <Aurora />
      <div className="relative z-10 flex h-full">
        {open && <div className="fixed inset-0 z-20 bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
        <aside className={`glass-strong fixed inset-y-3 left-3 z-30 flex w-64 flex-col rounded-2xl p-4 transition-transform md:static md:m-3 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-[110%]"}`}>
          <div className="mb-6 flex items-center gap-3 px-2 pt-1">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-md shadow-blue-600/20"><Sparkles size={20} className="text-white" /></div>
            <div>
              <div className="text-lg font-bold leading-tight text-slate-900">SupportAI</div>
              <div className="max-w-[10rem] truncate text-xs text-slate-500">{me.name}</div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to} to={to} end={end} onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <Icon size={18} /> {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between px-1 text-xs text-slate-500">
              <span>AI engine</span>
              <Badge tone={me.llm === "claude" ? "emerald" : "amber"}>{me.llm === "claude" ? "Claude" : "Offline mode"}</Badge>
            </div>
            <button className="btn btn-ghost w-full" onClick={() => { setToken(null); nav("/login"); }}><LogOut size={16} /> Sign out</button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 p-3 md:hidden">
            <button className="btn btn-ghost !p-2" onClick={() => setOpen(true)} aria-label="Menu"><Menu size={20} /></button>
            <span className="font-semibold text-slate-900">SupportAI</span>
          </div>
          <main className="scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 md:px-6 md:pt-6">
            <div className="mx-auto max-w-6xl"><Outlet /></div>
          </main>
        </div>
      </div>
    </MeCtx.Provider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth mode="login" />} />
      <Route path="/signup" element={<Auth mode="signup" />} />
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="playground" element={<Playground />} />
        <Route path="conversations" element={<Conversations />} />
        <Route path="gaps" element={<Gaps />} />
        <Route path="evaluation" element={<Evaluation />} />
        <Route path="handoffs" element={<Handoffs />} />
        <Route path="deploy" element={<Deploy />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

