import { abi } from "genlayer-js";
import type { JournalEntry, ReceiptLike } from "./transactions";
export function canonical(value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number") return String(value);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k,v]) => [k,canonical(v)]));
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,canonical(v)]));
  return value;
}
export function assertReceiptIdentity(receipt: ReceiptLike, entry: JournalEntry): void {
  const sender = String(receipt.sender || receipt.from_address || "").toLowerCase();
  const recipient = String(receipt.recipient || receipt.to_address || "").toLowerCase();
  if (sender !== entry.wallet.toLowerCase() || recipient !== entry.contract.toLowerCase())
    throw new Error("交易发送方或接收合约与原记录不一致，不能将它标记为本次操作完成。");
  const hash = String(receipt.hash || receipt.txId || "");
  if (hash && hash.toLowerCase() !== entry.hash?.toLowerCase()) throw new Error("节点返回的交易编号与原记录不一致。");
  const data = receipt.data as { calldata?: unknown } | undefined;
  const encoded = data?.calldata as { raw?: number[]; base64?: string } | string | undefined;
  let raw: Uint8Array;
  if (encoded && typeof encoded === "object" && Array.isArray(encoded.raw)) raw = new Uint8Array(encoded.raw);
  else {
    const b64 = typeof encoded === "string" ? encoded : encoded?.base64;
    if (!b64) throw new Error("回执缺少可解码的原始调用参数，请继续保留待核对状态。");
    raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }
  const decoded = abi.calldata.decode(raw);
  const call = decoded instanceof Map ? Object.fromEntries(decoded) : decoded as Record<string, unknown>;
  if (call?.method !== entry.action || JSON.stringify(canonical(call?.args)) !== JSON.stringify(canonical(entry.args)))
    throw new Error("回执方法或参数与原始草稿不一致，不能确认本次操作完成。");
}
