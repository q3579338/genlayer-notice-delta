import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant } from "genlayer-js/types";
import type { CalldataEncodable, TransactionHash } from "genlayer-js/types";
import { isAddress } from "viem";
import type { Address } from "viem";
import { APP_VERSION, DEPLOYMENT, NETWORK } from "./config";
import type { Draft, Notice, ReadState, Revision } from "./model";
import { normalizeDraft } from "./model";
import { assertCanSend, isUserRejection, loadJournal, mergeEntry, persistJournal, receiptOutcome } from "./transactions";
import type { JournalEntry, ReceiptLike } from "./transactions";
import { contractSource } from "./contract";
import { assertReceiptIdentity } from "./chain-guards";

export interface WalletProvider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}
declare global { interface Window { ethereum?: WalletProvider } }
const reader = createClient({ chain: studionet });
export function configured(): boolean { return isAddress(DEPLOYMENT.address); }
export function contractAddress(): Address {
  if (!configured()) throw new Error("当前版本尚未配置合约部署。请先浏览离线示例。");
  return DEPLOYMENT.address as Address;
}
export async function connectWallet(): Promise<string> {
  if (!window.ethereum) throw new Error("未检测到浏览器钱包。可继续浏览离线示例；链上操作需要支持 EIP-1193 的钱包。");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
  if (!accounts[0] || !isAddress(accounts[0])) throw new Error("钱包未提供有效账户。");
  const [current, chainId] = await Promise.all([
    window.ethereum.request({ method: "eth_accounts" }) as Promise<string[]>, window.ethereum.request({ method: "eth_chainId" }),
  ]);
  if (current[0]?.toLowerCase() !== accounts[0].toLowerCase()) throw new Error("连接期间账户已变化，请重新连接。");
  if (Number(chainId) !== NETWORK.id)
    throw new Error("钱包当前不在 GenLayer Studio。请使用“切换网络”按钮，再连接钱包。");
  return accounts[0].toLowerCase();
}
export async function switchNetwork(): Promise<void> {
  if (!window.ethereum) throw new Error("请先安装并解锁浏览器钱包。");
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${NETWORK.id.toString(16)}` }] });
  } catch (error) {
    if ((error as {code?: number}).code !== 4902) throw error;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{
      chainId: `0x${NETWORK.id.toString(16)}`, chainName: NETWORK.name,
      nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 }, rpcUrls: [NETWORK.rpc],
    }] });
  }
}
export async function verifySource(): Promise<void> {
  const address = contractAddress();
  if (Number(await reader.getChainId()) !== NETWORK.id) throw new Error("读取节点链 ID 与 Studio 不一致，已停止操作。");
  if (!contractSource.trim()) throw new Error("当前构建缺少可核对的合约源码，已停止链上操作。");
  const normalize = (source: string) => source.replace(/\r\n/g, "\n").trim();
  if (normalize(await reader.getContractCode(address)) !== normalize(contractSource))
    throw new Error("部署源码与 NoticeDelta 当前版本不一致，已停止操作。");
}
type Raw = Record<string, any>;
function object(value: unknown): Raw {
  if (value instanceof Map) return Object.fromEntries(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("节点返回的数据格式不完整。");
  return value as Raw;
}
function time(value: unknown): string {
  if (typeof value === "number" || typeof value === "bigint") return new Date(Number(value) * 1000).toISOString();
  return String(value || "");
}
export function mapComparison(value: unknown): Revision {
  const raw = object(value);
  const status = String(raw.status);
  if (!["CHANGED", "UNCHANGED", "UNKNOWN"].includes(status)) throw new Error("节点返回了无法识别的核验结果。");
  return { revision: Number(raw.revision), observedAt: time(raw.observed_at), verdict: status as Revision["verdict"],
    sourceUrl: "", contentHash: String(raw.source_hash || ""), evidence: String(raw.snapshot_text || ""),
    reason: String(raw.reason || raw.error || ""), findings: (raw.findings || []).map((item: unknown) => {
      const f = object(item);
      if (!["CHANGED", "UNCHANGED", "UNKNOWN"].includes(f.status)) throw new Error("关注事项的核验结果格式不完整。");
      return { question: String(f.criterion || ""), verdict: f.status,
        before: String(f.baseline_quote || ""), after: String(f.current_quote || ""), reason: String(f.reason || "") };
    }) };
}
function mapNotice(value: unknown, history: unknown[]): Notice {
  const raw = object(value);
  const baseline = raw.baseline ? object(raw.baseline) : null;
  const sourceUrl = String(raw.source_url || "");
  const revisions: Revision[] = baseline && raw.baseline_ready ? [{ revision: 0, observedAt: time(baseline.observed_at),
    verdict: "BASELINE", sourceUrl, contentHash: String(baseline.source_hash || ""),
    evidence: String(baseline.text || ""), reason: "所有后续核验均与此原始基线比较；不会自动替换基线。", findings: [] }] : [];
  revisions.push(...history.map(h => ({ ...mapComparison(h), sourceUrl })).sort((a,b) => a.revision - b.revision));
  return { id: Number(raw.id), owner: String(raw.owner || ""), title: String(raw.title || ""), sourceUrl,
    questions: (raw.criteria || []).map(String), createdAt: time(raw.created_at), baselineReady: !!raw.baseline_ready, revisions, raw: { notice: raw, history } };
}
export async function loadNotices(state: ReadState): Promise<{ notices: Notice[]; writable: boolean }> {
  await verifySource();
  const address = contractAddress();
  const read = (functionName: string, args: CalldataEncodable[] = []) => reader.readContract({ address, functionName, args,
    transactionHashVariant: state === "finalized" ? TransactionHashVariant.LATEST_FINAL : TransactionHashVariant.LATEST_NONFINAL });
  const stats = object(await read("get_stats"));
  if (stats.version !== APP_VERSION || stats.scope !== "studionet-prototype") throw new Error("合约版本或运行范围与 NoticeDelta 不匹配。");
  const rows: unknown[] = [];
  let before = 0;
  for (let page = 0; page < 25; page++) {
    const batch = await read("list_notices", [before, 20]);
    if (!Array.isArray(batch)) throw new Error("公告列表返回格式不完整。");
    rows.push(...batch);
    if (batch.length < 20) break;
    const ids = batch.map(r => Number(object(r).id));
    const next = Math.min(...ids);
    if (!Number.isSafeInteger(next) || next <= 0 || next === before) throw new Error("公告分页未能继续，已停止读取。");
    before = next;
  }
  const notices = await Promise.all(rows.map(async raw => {
    const id = Number(object(raw).id);
    const history = await read("get_history", [id, 0, 20]);
    if (!Array.isArray(history)) throw new Error("历史核验记录返回格式不完整。");
    return mapNotice(raw, history);
  }));
  let writable = false;
  if (/^0x[0-9a-fA-F]{64}$/.test(DEPLOYMENT.transaction)) {
    const receipt = await reader.getTransaction({ hash: DEPLOYMENT.transaction as TransactionHash });
    writable = receiptOutcome(receipt as unknown as ReceiptLike) === "finalized";
  }
  return { notices, writable };
}
export type WriteAction = "register_notice" | "capture_baseline" | "compare_notice";
export function createWriteArgs(action: WriteAction, draftOrId: Draft | number, requestId: string): CalldataEncodable[] {
  if (action === "register_notice") {
    const draft = normalizeDraft(draftOrId as Draft);
    return [requestId, draft.sourceUrl, draft.title, draft.questions];
  }
  if (!Number.isSafeInteger(draftOrId) || Number(draftOrId) < 1) throw new Error("公告编号无效。");
  return action === "capture_baseline" ? [Number(draftOrId)] : [Number(draftOrId), requestId];
}
export async function readTransaction(entry: JournalEntry): Promise<JournalEntry> {
  if (entry.chainId !== NETWORK.id || !entry.hash || !/^0x[0-9a-fA-F]{64}$/.test(entry.hash))
    throw new Error("请先填写钱包中的原交易编号。系统不会重新发送这笔交易。");
  const receipt = await reader.getTransaction({ hash: entry.hash as TransactionHash }) as unknown as ReceiptLike;
  assertReceiptIdentity(receipt, entry);
  const phase = receiptOutcome(receipt);
  const readback = phase === "finalized" ? await verifyReadback(entry) : undefined;
  return { ...entry, receipt, readback, checkedAt: new Date().toISOString(), phase: phase === "pending" ? "broadcast" : phase };
}
async function verifyReadback(entry: JournalEntry): Promise<unknown> {
  await verifySource();
  if (entry.contract.toLowerCase() !== contractAddress().toLowerCase()) throw new Error("此历史交易不属于当前配置合约，请通过原部署单独核对。");
  const read = (functionName: string, args: CalldataEncodable[] = []) => reader.readContract({ address: contractAddress(), functionName, args,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  if (entry.action === "register_notice") {
    let before = 0;
    for (let page = 0; page < 25; page++) {
      const rows = await read("list_notices", [before, 20]);
      if (!Array.isArray(rows)) throw new Error("无法读回已登记公告。");
      const found = rows.map(object).find(row => String(row.owner).toLowerCase() === entry.wallet.toLowerCase() && row.request_id === entry.args[0]);
      if (found) {
        if (found.source_url !== entry.args[1] || found.title !== entry.args[2] || JSON.stringify(found.criteria) !== JSON.stringify(entry.args[3])) throw new Error("公告读回内容与原登记参数不一致。");
        return found;
      }
      if (rows.length < 20) break;
      before = Math.min(...rows.map(row => Number(object(row).id)));
    }
    throw new Error("交易已最终确认，但尚未在最终状态读回匹配的公告；请稍后重查，不要重发。");
  }
  const notice = object(await read("get_notice", [Number(entry.args[0])]));
  if (String(notice.owner).toLowerCase() !== entry.wallet.toLowerCase()) throw new Error("读回公告的登记钱包不一致。");
  if (entry.action === "capture_baseline") {
    const baseline = notice.baseline ? object(notice.baseline) : null;
    if (!notice.baseline_ready || !baseline?.text || !baseline?.source_hash) throw new Error("尚未读回完整基线，请继续保留原交易记录。");
    return notice;
  }
  const history = await read("get_history", [Number(entry.args[0]), 0, 20]);
  const found = Array.isArray(history) ? history.map(object).find(row => row.request_id === entry.args[1]) : undefined;
  if (!found) throw new Error("交易已最终确认，但尚未读回本次请求的核验记录；请稍后重查，不要重发。");
  return found;
}
export async function sendTransaction(action: WriteAction, args: CalldataEncodable[], wallet: string,
  onEntry: (entry: JournalEntry) => void): Promise<JournalEntry> {
  if (!navigator.locks) throw new Error("此浏览器缺少安全的多标签页交易锁。请在支持 Web Locks 的现代浏览器中操作。");
  return navigator.locks.request("notice-delta:studionet:write", async () => {
    const address = contractAddress();
    const journal = loadJournal(localStorage);
    assertCanSend(journal, address);
    await verifySource();
    if (!/^0x[0-9a-fA-F]{64}$/.test(DEPLOYMENT.transaction)) throw new Error("尚未配置可核对的最终部署交易，当前只读。");
    const deploy = await reader.getTransaction({ hash: DEPLOYMENT.transaction as TransactionHash });
    if (receiptOutcome(deploy as unknown as ReceiptLike) !== "finalized") throw new Error("部署交易尚未最终确认并执行成功，当前只读。");
    const provider = window.ethereum;
    if (!provider) throw new Error("请先连接钱包。");
    const [accounts, chainId] = await Promise.all([
      provider.request({ method: "eth_accounts" }) as Promise<string[]>, provider.request({ method: "eth_chainId" }),
    ]);
    if (Number(chainId) !== NETWORK.id || accounts[0]?.toLowerCase() !== wallet.toLowerCase())
      throw new Error("钱包账户或网络已变化，请重新连接并加载。");
    let entry: JournalEntry = { id: crypto.randomUUID(), chainId: NETWORK.id, contract: address,
      wallet, action, args, createdAt: new Date().toISOString(), phase: "awaiting-wallet" };
    const save = (next: JournalEntry) => {
      entry = next;
      onEntry(entry);
      persistJournal(localStorage, mergeEntry(loadJournal(localStorage), entry));
    };
    // Persist the exact request_id and arguments before any signing request.
    save(entry);
    let signingRequested = false;
    try {
      const trackedProvider = { request: async (request: {method: string; params?: unknown[] | Record<string, unknown>}) => {
        if (request.method === "eth_sendTransaction" || request.method === "eth_sendRawTransaction" || request.method.startsWith("wallet_send")) signingRequested = true;
        return provider.request(request);
      } };
      const client = createClient({ chain: studionet, account: wallet as Address,
        provider: trackedProvider as NonNullable<Parameters<typeof createClient>[0]>["provider"] });
      const hash = await client.writeContract({ address, functionName: action, args, value: 0n });
      if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("钱包没有返回可识别的交易编号。请在钱包中核对后恢复记录。");
      save({ ...entry, hash, phase: "broadcast" });
      return entry;
    } catch (error) {
      const rejected = isUserRejection(error);
      const recovery = { ...entry, phase: rejected || !signingRequested ? "failed" : "uncertain", error: error instanceof Error ? error.message : String(error) } as JournalEntry;
      try { save(recovery); } catch { onEntry(recovery); }
      throw error;
    }
  });
}
