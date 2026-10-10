import { ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

export const Aurora = () => (
  <div className="fixed inset-0 z-0 bg-white" aria-hidden />
);

export const Glass =({ children, className = "", strong = false }: { children: ReactNode; className?: string; strong?: boolean }) => (
  <div className={`${strong ? "glass-strong" : "glass"} rounded-2xl ${className}`}>{children}</div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-rise">
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
      {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

type Tone = "indigo" | "emerald" | "amber" | "rose" | "cyan" | "slate";
const tones: Record<Tone, string> = {
  indigo: "bg-blue-50 text-blue-700 border-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  cyan: "bg-sky-50 text-sky-700 border-sky-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};
export const Badge = ({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) => (
  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
);

export const Stat = ({
  label, value, hint, icon, tone = "indigo",
}: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone }) => (
  <Glass className="glass-hover p-5">
    <div className="flex items-start justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      {icon && <span className={`rounded-lg border p-1.5 ${tones[tone]}`}>{icon}</span>}
    </div>
    <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
    {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
  </Glass>
);

export const Empty = ({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) => (
  <Glass className="flex flex-col items-center px-6 py-14 text-center">
    <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-blue-600">{icon}</div>
    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>
    {action && <div className="mt-5">{action}</div>}
  </Glass>
);

export const Skeleton = ({ className = "h-24" }: { className?: string }) => <div className={`skeleton ${className}`} />;

export const Meter = ({ value, color = "#2563eb" }: { value: number; color?: string }) => (
  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, background: color }} />
  </div>
);

export const Modal = ({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className={`glass-strong max-h-[85vh] w-full overflow-hidden rounded-2xl ${wide ? "max-w-3xl" : "max-w-lg"} animate-rise`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="scroll max-h-[calc(85vh-64px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};

/* ---------- toasts ---------- */
type Toast = { id: number; msg: string; ok: boolean };
const ToastCtx = createContext<(msg: string, ok?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, ok = true) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg, ok }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="glass-strong flex max-w-sm animate-rise items-center gap-2 rounded-xl px-4 py-3 text-sm text-slate-800">
            {t.ok ? <CheckCircle2 size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-rose-500" />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, loading, error, reload, setData };
}
