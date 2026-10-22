export type Verdict = "BASELINE_REQUIRED" | "BASELINE" | "CHANGED" | "UNCHANGED" | "UNKNOWN";
export type ReadState = "accepted" | "finalized";
export interface Finding {
  question: string; verdict: "CHANGED" | "UNCHANGED" | "UNKNOWN";
  before: string; after: string; reason: string;
}
export interface Revision {
  revision: number; observedAt: string; verdict: Verdict;
  sourceUrl: string; contentHash: string; evidence: string;
  reason: string; findings: Finding[];
}
export interface Notice {
  id: number; title: string; sourceUrl: string; questions: string[];
  owner: string; createdAt: string; revisions: Revision[];
  baselineReady?: boolean;
  raw?: unknown;
}
export interface Draft { title: string; sourceUrl: string; questions: string[] }
export const VERDICT_LABEL: Record<Verdict, string> = {
  BASELINE_REQUIRED: "等待建立基线", BASELINE: "基线已建立", CHANGED: "发现变化", UNCHANGED: "未发现变化", UNKNOWN: "暂时无法确认",
};
export function normalizeDraft(draft: Draft): Draft {
  const title = draft.title.trim();
  if (title.length < 3 || title.length > 120) throw new Error("请填写 3–120 个字符的公告名称。");
  let url: URL;
  try { url = new URL(draft.sourceUrl.trim()); } catch { throw new Error("请填写完整的 HTTPS 公告地址。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port)
    throw new Error("来源须为 HTTPS 地址，不含账号、密码或页内锚点。");
  const host = url.hostname.toLowerCase();
  if (!["portal.genlayer.foundation", "talks.genlayer.foundation", "genlayer.foundation", "www.genlayer.foundation", "genlayer.com", "www.genlayer.com", "docs.genlayer.com", "raw.githubusercontent.com", "github.com"].includes(host))
    throw new Error("此原型仅支持 GenLayer 官方域名及 GitHub 公开来源，请查看下方允许域名说明。");
  const questions = draft.questions.map(q => q.trim()).filter(Boolean);
  if (questions.length < 1 || questions.length > 4) throw new Error("请填写 1–4 条明确的关注事项。");
  if (questions.some(q => q.length < 8 || q.length > 300)) throw new Error("每条关注事项请填写 8–300 个字符，说明要核对的具体条款。");
  if (new Set(questions).size !== questions.length) throw new Error("关注事项不能重复。");
  return { title, sourceUrl: url.toString(), questions };
}
export function latestRevision(notice: Notice): Revision | undefined { return notice.revisions.at(-1); }
export function filterNotices(notices: Notice[], query: string, verdict: string): Notice[] {
  const term = query.trim().toLowerCase();
  return notices.filter(n => (!term || [n.title, n.sourceUrl, ...n.questions].join(" ").toLowerCase().includes(term))
    && (verdict === "ALL" || latestRevision(n)?.verdict === verdict));
}
export function safeJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v instanceof Map ? Object.fromEntries(v) : v, 2);
}
export function shorten(value: string, width = 6): string {
  return value.length > width * 2 + 3 ? `${value.slice(0, width)}…${value.slice(-width)}` : value;
}
export function exportBundle(notices: Notice[], mode: "offline-example" | "chain", metadata: Record<string, unknown>) {
  return { format: "notice-delta/export-v1", exportedAt: new Date().toISOString(), mode,
    notice: mode === "offline-example" ? "虚构离线示例；未经 GenLayer 获取、核验或上链。" : "公开链上读取快照；请独立核对交易与来源。",
    ...metadata, notices };
}
