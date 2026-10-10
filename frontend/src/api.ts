const TOKEN_KEY = "supportai_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  if (res.status === 401 && token) {
    setToken(null);
    window.location.href = "/login";
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: any) => d.msg).join(", ") : msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

export interface Citation {
  n: number;
  doc: string;
  doc_id: number;
  page: number | null;
  section: string | null;
  snippet: string;
  score: number;
}

export interface ChatResult {
  answer: string;
  answered: boolean;
  escalate: boolean;
  citations: Citation[];
  confidence: number;
  grounded: number | null;
  latency_ms: number;
  retrieval_ms: number;
  message_id: number;
  mode: string;
  retrieved?: Citation[];
}

export interface Me {
  id: number;
  name: string;
  email: string;
  bot_id: string;
  bot_name: string;
  brand_color: string;
  welcome: string;
  support_email: string;
  threshold: number;
  llm: string;
}

export const fmtPct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);
export const fmtMs = (v: number | null | undefined) => (v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`);
export const timeAgo = (iso: string) => {
  const d = new Date(iso.replace(" ", "T") + "Z").getTime();
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
