export interface ReceiptLike { status?: string | number; statusName?: string; txExecutionResult?: number; [key: string]: unknown }
export interface JournalEntry {
  id: string; hash?: string; chainId: number; contract: string; wallet: string;
  action: string; args: unknown[]; createdAt: string;
  phase: "awaiting-wallet" | "broadcast" | "accepted" | "finalized" | "failed" | "uncertain";
  receipt?: ReceiptLike; checkedAt?: string;
  readback?: unknown;
  error?: string;
}
export const JOURNAL_KEY = "notice-delta:studionet:wallet-journal:v1";
export function receiptOutcome(receipt: ReceiptLike): "accepted" | "finalized" | "failed" | "pending" {
  const status = String(receipt.statusName || receipt.status || "").toUpperCase();
  if (status === "CANCELED" || status === "8") return "failed";
  if (status === "FINALIZED" || status === "7") {
    const consensus = receipt.consensus_data as { leader_receipt?: unknown[] } | undefined;
    const leaders = consensus?.leader_receipt || receipt.leaderReceipt;
    if (receipt.txExecutionResult !== undefined && receipt.txExecutionResult !== 1) return "failed";
    if (Array.isArray(leaders) && leaders.length) {
      const outcomes = leaders as { mode?: string; execution_result?: string; result?: { status?: string } }[];
      // Late validators can be cancelled after quorum. Only the latest leader's
      // execution plus final consensus decides the contract execution outcome.
      const leader = outcomes.filter(row => row.mode?.toLowerCase() === "leader").at(-1);
      if (!leader) throw new Error("最终回执缺少可识别的 leader 执行结果，暂不能确认成功。");
      if (leader.execution_result === "ERROR" || (leader.result?.status && leader.result.status !== "return")) return "failed";
      const consensusResult = receipt.resultName || (typeof receipt.result === "string" ? receipt.result : undefined);
      if (consensusResult && consensusResult !== "MAJORITY_AGREE" && consensusResult !== "SUCCESS")
        throw new Error("最终共识结果未确认同意，暂不能确认成功。");
      if (leader.execution_result === "SUCCESS" && leader.result?.status === "return") return "finalized";
      throw new Error("最终回执的 Studio leader 执行信息不完整，暂不能确认成功。");
    }
    if (receipt.txExecutionResult === undefined) throw new Error("最终回执缺少执行结果，暂不能确认成功。");
    return "finalized";
  }
  return status === "ACCEPTED" || status === "5" ? "accepted" : "pending";
}
export function isBlocking(entry: JournalEntry): boolean { return !["finalized", "failed"].includes(entry.phase); }
export function loadJournal(storage: Pick<Storage, "getItem">): JournalEntry[] {
  const raw = storage.getItem(JOURNAL_KEY);
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.some(e => !e || e.chainId !== 61999 || typeof e.id !== "string" || typeof e.contract !== "string" || typeof e.wallet !== "string" || !Array.isArray(e.args)))
    throw new Error("本地交易记录格式不完整，请先导出和核对，不要重复发送。");
  return value as JournalEntry[];
}
export function persistJournal(storage: Pick<Storage, "setItem">, journal: JournalEntry[]): void {
  storage.setItem(JOURNAL_KEY, JSON.stringify(journal, (_, v) => typeof v === "bigint" ? String(v) : v));
}
export function mergeEntry(journal: JournalEntry[], entry: JournalEntry): JournalEntry[] {
  return [...journal.filter(e => e.id !== entry.id), entry].sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
export function assertCanSend(journal: JournalEntry[], contract: string): void {
  if (journal.some(e => e.contract.toLowerCase() === contract.toLowerCase() && isBlocking(e)))
    throw new Error("此合约仍有待确认或中断的交易。请先在交易记录中核对，不要重复发送。");
}
export function isUserRejection(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: number; name?: string; cause?: unknown };
    if (item.code === 4001 || item.name === "UserRejectedRequestError") return true;
    current = item.cause;
  }
  return false;
}
