import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { EXAMPLE } from "./example";
import { APP_VERSION, DEPLOYMENT, NETWORK } from "./config";
import type { Draft, Notice, ReadState, Revision, Verdict } from "./model";
import { VERDICT_LABEL, exportBundle, filterNotices, latestRevision, normalizeDraft, safeJson, shorten } from "./model";
import type { JournalEntry } from "./transactions";
import { isBlocking, loadJournal, mergeEntry, persistJournal } from "./transactions";
import type { WriteAction } from "./chain";
import { contractSource } from "./contract";

function configured() { return /^0x[0-9a-fA-F]{40}$/.test(DEPLOYMENT.address); }

type IconName = "grid" | "clock" | "book" | "arrow" | "plus" | "search" | "check" | "link" | "download" | "wallet" | "close" | "refresh" | "shield" | "file" | "external" | "chevron";
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    book: <><path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3zM12 6v15"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    check: <path d="m5 12 4 4L19 6"/>, link: <><path d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"/></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/></>, wallet: <><path d="M4 6h16v15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13v3m0 6h5v5h-5a2.5 2.5 0 0 1 0-5"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, refresh: <><path d="M20 8a8 8 0 1 0 .5 7M20 3v5h-5"/></>,
    shield: <><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z"/><path d="m8 12 3 3 5-6"/></>,
    file: <><path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h6"/></>,
    external: <><path d="M14 3h7v7m0-7L11 13M10 4H3v17h17v-7"/></>, chevron: <path d="m9 5 7 7-7 7"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Badge({ verdict }: { verdict: Verdict }) { return <span className={`badge ${verdict.toLowerCase()}`}><span className="status-dot"/>{VERDICT_LABEL[verdict]}</span>; }
function date(value: string) {
  if (!value) return "未记录";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(d);
}
function download(data: string, filename: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    container.current?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = container.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,textarea,select,[tabindex="0"]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === container.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = bodyOverflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={container}><header><div><p className="eyebrow">NOTICEDELTA</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭对话框"><Icon name="close"/></button></header>{children}</div></div>;
}

export default function App() {
  const [mode, setMode] = useState<"example" | "chain">("example");
  const [page, setPage] = useState<"notices" | "transactions" | "guide">("notices");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [wallet, setWallet] = useState("");
  const [writable, setWritable] = useState(false);
  const [readState, setReadState] = useState<ReadState>("finalized");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [message, setMessage] = useState<{ type: "error" | "info" | "success"; text: string } | null>(null);
  const [modal, setModal] = useState<"create" | "deploy" | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [revisionIndex, setRevisionIndex] = useState(-1);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [storageIssue, setStorageIssue] = useState("");
  const [recoveryHashes, setRecoveryHashes] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Draft>({ title: "", sourceUrl: "", questions: [""] });
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const live = mode === "chain";
  const source = live ? notices : EXAMPLE;
  const visible = filterNotices(source, query, filter);
  const blocking = journal.some(e => isBlocking(e) && e.contract.toLowerCase() === DEPLOYMENT.address.toLowerCase());
  const writeEnabled = live && writable && !!wallet && !sending && !blocking && !storageIssue && readState === "finalized";
  function fail(error: unknown) { setMessage({ type: "error", text: error instanceof Error ? error.message : String(error) }); }
  useEffect(() => {
    function read() { try { setJournal(loadJournal(localStorage)); } catch (error) { setStorageIssue(error instanceof Error ? error.message : "无法读取交易记录。链上写入已停用。"); } }
    read();
    function invalidate() {
      epoch.current += 1; setWallet(""); setWritable(false); setNotices([]); setSelected(null); setLoading(false);
      setMessage({ type: "info", text: "钱包账户或网络已变化。旧读取已清空，请重新连接并加载；交易记录仍保留。" });
    }
    window.addEventListener("storage", read);
    window.ethereum?.on?.("accountsChanged", invalidate); window.ethereum?.on?.("chainChanged", invalidate);
    return () => { window.removeEventListener("storage", read); window.ethereum?.removeListener?.("accountsChanged", invalidate); window.ethereum?.removeListener?.("chainChanged", invalidate); };
  }, []);
  async function load() {
    if (loading) return;
    if (!configured()) { setModal("deploy"); return; }
    const token = ++epoch.current;
    setLoading(true); setWritable(false); setMessage(null);
    try {
      const { loadNotices } = await import("./chain"); const result = await loadNotices(readState);
      if (token !== epoch.current) return;
      setNotices(result.notices); setWritable(result.writable);
      setMessage({ type: "success", text: `已读取 ${result.notices.length} 条公告，源码与版本匹配。${readState === "accepted" ? "当前为临时接受状态，不能据此确认最终结果。" : "使用最终确认读取模式。"}` });
    } catch (error) { if (token === epoch.current) { setNotices([]); fail(error); } }
    finally { if (token === epoch.current) setLoading(false); }
  }
  async function connect() { try { const { connectWallet } = await import("./chain"); const account = await connectWallet(); { setWallet(account); setMessage({ type: "info", text: "钱包已连接。连接不会登记公告或发送交易；请加载合约后选择具体操作。" }); } } catch (error) { fail(error); } }
  function record(entry: JournalEntry) { setJournal(previous => mergeEntry(previous, entry)); }
  async function write(action: WriteAction, value: Draft | number) {
    if (inFlight.current) return;
    if (!writeEnabled) { setMessage({ type: "info", text: blocking ? "请先处理交易记录中尚未确认的请求。" : "链上写入需要已核对的部署、最终确认读取和已连接的钱包。" }); return; }
    const requestId = crypto.randomUUID();
    let args;
    try { const { createWriteArgs } = await import("./chain"); args = createWriteArgs(action, value, requestId); } catch (error) { fail(error); return; }
    inFlight.current = true; setSending(true); setMessage({ type: "info", text: "正在核对部署、源码和钱包。之后请审阅钱包中的本次操作；关闭页面后可从交易记录恢复。" });
    try {
      const { sendTransaction } = await import("./chain"); const entry = await sendTransaction(action, args, wallet, record);
      setModal(null); setSelected(null); setPage("transactions");
      setMessage({ type: "success", text: `交易已广播，编号 ${entry.hash}。这还不代表执行成功，请查询共识与最终确认结果。` });
    } catch (error) { fail(error); setPage("transactions"); setModal(null); setSelected(null); }
    finally { inFlight.current = false; setSending(false); }
  }
  async function check(entry: JournalEntry) {
    if (loading) return;
    setLoading(true);
    try {
      const input = entry.hash ? entry : { ...entry, hash: recoveryHashes[entry.id]?.trim() };
      const { readTransaction } = await import("./chain"); const checked = await readTransaction(input);
      const next = mergeEntry(loadJournal(localStorage), checked);
      record(checked);
      try { persistJournal(localStorage, next); } catch { setStorageIssue("最新回执未能保存。请立即导出记录；当前停止新交易。"); }
      setMessage({ type: checked.phase === "failed" ? "error" : checked.phase === "finalized" ? "success" : "info", text: checked.phase === "finalized" ? "本笔交易已最终确认且执行成功。回到公告台加载最新状态。" : checked.phase === "failed" ? "本笔交易已取消或最终执行失败。请查看原始回执；系统没有重发。" : checked.phase === "accepted" ? "共识已接受，尚未最终确认。请保留编号，稍后继续查询。" : "交易仍在处理中，编号和参数已保留，请稍后继续查询。" });
    } catch (error) { fail(error); }
    finally { setLoading(false); }
  }
  function exportRecords() {
    download(safeJson(exportBundle(source, live ? "chain" : "offline-example", { appVersion: APP_VERSION,
      chainId: live ? NETWORK.id : null, contract: live ? DEPLOYMENT.address : null,
      readState: live ? readState : null, transactions: live ? journal : [] })), `notice-delta-${live ? "chain" : "offline-example"}-${new Date().toISOString().slice(0,10)}.json`);
  }
  const currentRevision = selected ? selected.revisions[revisionIndex < 0 ? selected.revisions.length - 1 : revisionIndex] : undefined;
  function view(notice: Notice) { setSelected(notice); setRevisionIndex(-1); }
  function chooseMode(next: "example" | "chain") { setMode(next); setSelected(null); setQuery(""); setFilter("ALL"); setMessage(null); }
  function submit(e: FormEvent) { e.preventDefault(); try { normalizeDraft(draft); void write("register_notice", draft); } catch (error) { fail(error); } }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); setPage("notices");}}><span className="brand-mark">N<span/></span><span>NoticeDelta<small>NOTICE VERIFICATION</small></span></a>
      <p className="nav-caption">工作空间</p>
      <nav aria-label="主导航">
        <button aria-label="公告核验台" className={page === "notices" ? "active" : ""} onClick={() => setPage("notices")}><Icon name="grid"/><span>公告核验台</span><span className="nav-count">{source.length}</span></button>
        <button aria-label="交易与恢复" className={page === "transactions" ? "active" : ""} onClick={() => setPage("transactions")}><Icon name="clock"/><span>交易与恢复</span>{journal.some(isBlocking) && <i className="pending-dot"/>}</button>
        <button aria-label="使用说明" className={page === "guide" ? "active" : ""} onClick={() => setPage("guide")}><Icon name="book"/><span>使用说明</span></button>
      </nav>
      <div className="sidebar-note"><span className="sidebar-note-icon"><Icon name="shield" size={22}/></span><strong>先看证据，再做判断</strong><p>关注条款发生了什么变化。证据不足时，明确保留未知。</p><button onClick={() => setPage("guide")}>了解核验方式 <Icon name="arrow" size={16}/></button></div>
      <div className="network-label"><span className="status-dot"/><div>GenLayer Studio<small>研究原型 · 无资金托管</small></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">工作空间 <Icon name="chevron" size={14}/><strong>{page === "notices" ? "公告核验台" : page === "transactions" ? "交易与恢复" : "使用说明"}</strong></div><div className="top-actions"><span className="network-chip"><span className="status-dot"/>Studio</span><button className="button wallet-button" onClick={connect}><Icon name="wallet" size={17}/>{wallet ? shorten(wallet, 4) : "连接钱包"}</button></div></header>
      <main>
        <div className="page-heading"><div><p className="eyebrow">TRACK WHAT MATTERS</p><h1>{page === "notices" ? "每一次变化，都有据可查。" : page === "transactions" ? "让每笔操作，都能继续核对。" : "从一份公告，到可追溯的变化。"}</h1><p className="intro">{page === "notices" ? "保存公告基线，持续核验你关心的条款，让前后版本自己说话。" : page === "transactions" ? "保留原始参数和交易编号，区分已广播、共识接受与最终确认。" : "固定来源与关注事项，由 GenLayer 获取公开正文并保留核验记录。"}</p></div><button className="button primary" onClick={() => { setPage("notices"); live ? setModal("create") : setModal("deploy"); }}><Icon name="plus" size={18}/>登记新公告</button></div>
        <div className="mode-bar"><div className="segmented" aria-label="数据模式"><button className={!live ? "selected" : ""} onClick={() => chooseMode("example")}>离线示例</button><button className={live ? "selected" : ""} onClick={() => chooseMode("chain")}>链上工作区</button></div><p>{live ? configured() ? <>合约 {shorten(DEPLOYMENT.address)} · 仅公开数据</> : <>当前版本<span className="inline-status">尚未部署</span></> : <>虚构演示数据 · 未经 GenLayer 核验或上链</>}</p><button className="text-button" onClick={() => setModal("deploy")}><Icon name="link" size={15}/>部署与连接</button></div>
        {message && <div role="status" aria-live="polite" className={`notice-banner ${message.type}`}><span>{message.text}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setMessage(null)}><Icon name="close" size={17}/></button></div>}
        {storageIssue && <div className="notice-banner error" role="alert">{storageIssue}<button className="text-button" onClick={() => download(safeJson({ journal, raw: localStorage.getItem("notice-delta:studionet:wallet-journal:v1") }), "notice-delta-recovery.json")}>导出恢复记录</button></div>}
        {page === "notices" && <>
          <section className="stats-grid" aria-label="公告状态概览">
            <div className="stat-card"><span className="stat-icon navy"><Icon name="file"/></span><div><span>跟踪公告</span><strong>{source.length.toString().padStart(2,"0")}</strong></div><span className="stat-foot">固定来源与关注事项</span></div>
            <div className="stat-card"><span className="stat-icon amber"><Icon name="refresh"/></span><div><span>发现变化</span><strong>{source.filter(n => latestRevision(n)?.verdict === "CHANGED").length.toString().padStart(2,"0")}</strong></div><span className="stat-foot">相对原始基线</span></div>
            <div className="stat-card"><span className="stat-icon teal"><Icon name="check"/></span><div><span>核验记录</span><strong>{source.reduce((sum,n) => sum + n.revisions.filter(r => r.verdict !== "BASELINE").length,0).toString().padStart(2,"0")}</strong></div><span className="stat-foot">版本与证据一并保留</span></div>
          </section>
          <section className="workspace-panel">
            <div className="panel-heading"><div><h2>我的公告<span>{source.length}</span></h2><p>每条公告的最新核验与原文证据</p></div><button className="button small secondary" onClick={exportRecords}><Icon name="download" size={16}/>导出记录</button></div>
            {live && <div className="chain-toolbar"><label>读取状态<select value={readState} onChange={e => { epoch.current += 1; setReadState(e.target.value as ReadState); setWritable(false); setNotices([]); setLoading(false); }}><option value="finalized">最终确认</option><option value="accepted">共识已接受（临时）</option></select></label><button className="button small" disabled={loading} onClick={load}><Icon name="refresh" size={15}/>{loading ? "正在核对…" : "加载链上公告"}</button></div>}
            <div className="filter-bar"><label className="search"><Icon name="search" size={17}/><input aria-label="搜索公告" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索公告名称、来源或关注事项…"/></label><select aria-label="筛选核验状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">全部状态</option><option value="CHANGED">发现变化</option><option value="UNCHANGED">未发现变化</option><option value="UNKNOWN">暂时无法确认</option><option value="BASELINE">基线已建立</option></select></div>
            <div className="notice-list">{visible.map(notice => {
              const rev = latestRevision(notice);
              return <article className="notice-card" key={notice.id}><div className="notice-card-top"><div className="notice-source-icon"><Icon name="file" size={25}/></div><div className="notice-card-title"><div className="card-title-line"><h3><button onClick={() => view(notice)}>{notice.title}</button></h3>{!live && <span className="example-tag">离线示例</span>}</div><span className="source-domain">{new URL(notice.sourceUrl).hostname}<span>·</span>{notice.questions.length} 条关注事项</span></div><Badge verdict={rev?.verdict || "BASELINE_REQUIRED"}/></div><div className="card-summary"><p>{rev?.reason || (rev?.verdict === "CHANGED" ? "关注条款发现变化。请查看逐条结果及前后版本证据。" : rev?.verdict === "UNKNOWN" ? "证据不足或来源暂不可用，不能确认条款是否变化。" : rev ? "核验结果与原文证据已保存，请查看逐条判断。" : "登记已完成。下一步由 GenLayer 获取并冻结来源基线。")}</p><div className="criteria-chips">{notice.questions.map((q,i) => <span key={q}><i>{i+1}</i>{q}</span>)}</div></div><footer><span><Icon name="clock" size={14}/>{rev ? `最近记录 ${date(rev.observedAt)}` : `登记于 ${date(notice.createdAt)}`}</span><div><span className="version-label">{notice.revisions.length} 个版本</span><button className="text-button" onClick={() => view(notice)}>查看证据 <Icon name="arrow" size={17}/></button></div></footer></article>;
            })}{!visible.length && <div className="empty-state"><span><Icon name="file" size={30}/></span><h3>{live && !notices.length ? "从一份值得关注的公告开始" : "没有找到匹配的公告"}</h3><p>{live ? configured() ? "先加载合约读取公开公告，或在连接钱包后登记来源。" : "当前未部署合约。你可以查看离线示例、下载源码和阅读部署步骤。" : "试试其他名称或核验状态。"}</p><button className="button secondary" onClick={() => live ? setModal("deploy") : setQuery("")}>{live ? "查看部署说明" : "清除搜索"}</button></div>}</div>
          </section>
          <section className="explain-strip"><span className="explain-symbol"><Icon name="shield" size={27}/></span><div><h3>保留未知，也是严谨核验的一部分。</h3><p>来源不可用、条款含糊或证据不足时，返回 UNKNOWN。正文哈希用于核对内容，不证明发布者身份。</p></div><button className="text-button" onClick={() => setPage("guide")}>核验如何工作 <Icon name="arrow" size={17}/></button></section>
        </>}
        {page === "transactions" && <section className="workspace-panel"><div className="panel-heading"><div><h2>交易记录<span>{journal.length}</span></h2><p>只读查询不会弹出签名，也不会重新发送交易。</p></div><button className="button small secondary" onClick={() => download(safeJson({ app: APP_VERSION, network: NETWORK, journal }), "notice-delta-transactions.json")}><Icon name="download" size={16}/>导出交易</button></div><div className="transaction-list">{journal.length ? journal.map(entry => <article className="transaction-card" key={entry.id}><div className="transaction-title"><strong>{{ register_notice: "登记公告", capture_baseline: "建立基线", compare_notice: "核验当前版本" }[entry.action] || entry.action}</strong><span className={`badge ${entry.phase === "finalized" ? "unchanged" : entry.phase === "failed" ? "changed" : "unknown"}`}>{{"awaiting-wallet":"等待钱包／页面曾中断",broadcast:"已广播",accepted:"共识已接受 · 非最终",finalized:"最终确认 · 执行成功",failed:"未发送／已取消／执行失败",uncertain:"状态待核对"}[entry.phase]}</span></div><p className="mono">{entry.hash || "尚未取得交易编号，请先核对钱包活动"}</p><small>{date(entry.createdAt)} · 钱包 {shorten(entry.wallet)} · Studio {entry.chainId}</small>{!entry.hash && isBlocking(entry) && <label className="field recovery-field">从钱包恢复原交易编号<input value={recoveryHashes[entry.id] || ""} placeholder="0x…（64 位十六进制交易编号）" onChange={e => setRecoveryHashes({...recoveryHashes,[entry.id]:e.target.value})}/><span>先在钱包核对是否已广播；未核对前，本应用会阻止新交易。</span></label>}<div className="transaction-actions"><button className="button small" disabled={loading || (!entry.hash && !recoveryHashes[entry.id])} onClick={() => check(entry)}><Icon name="refresh" size={15}/>查询原交易</button><details><summary>查看参数与原始回执</summary><pre>{safeJson(entry)}</pre></details></div></article>) : <div className="empty-state"><span><Icon name="clock" size={30}/></span><h3>还没有发送过交易</h3><p>离线示例不产生交易。真实操作前，会先保存本次参数；交易发送后保留编号。</p><button className="button secondary" onClick={() => setPage("notices")}>回到公告台</button></div>}</div></section>}
        {page === "guide" && <section className="guide-grid"><article className="workspace-panel guide-main"><p className="eyebrow">THREE STEPS, ONE CLEAR RECORD</p><h2>固定基线，跟踪真正关心的条款。</h2>{[
          ["01", "登记公告", "填写公开来源、公告名称和 1–4 条明确关注事项。登记只记录约定，不会自动抓取或确认来源。"],
          ["02", "建立原始基线", "手动发起建立基线。GenLayer 获取公开正文，独立验证者须对规范化渲染内容达成一致；失败时不会保存假基线。"],
          ["03", "核验当前版本", "再次手动发起核验，与原始基线逐条比较。每次保留结果、逐字引文、正文快照与哈希链。后续核验不会替换基线。"],
        ].map(([n,t,p]) => <div className="guide-step" key={n}><span>{n}</span><div><h3>{t}</h3><p>{p}</p></div></div>)}</article><aside className="guide-side"><div className="workspace-panel"><h3>结果怎么读</h3><Badge verdict="CHANGED"/><p>两个版本均有明确证据，相关条款发生实质变化。</p><Badge verdict="UNCHANGED"/><p>对应条款含义相同；全文相同也可确定未变。</p><Badge verdict="UNKNOWN"/><p>来源不可用、条款缺失、证据含糊或验证无共识。</p></div><div className="workspace-panel"><h3>当前原型范围</h3><p>Studio 测试环境；每钱包最多 20 条公告，每公告最多 20 次核验。来源正文 40–16,000 字符。</p><p>支持 GenLayer 相关域名与 GitHub。动态页面可能无法取得一致正文；结果需要人工核对。</p><p>没有自动订阅、定时抓取、资格判断或资金托管。</p></div></aside></section>}
        <footer className="page-footer"><span><b>NoticeDelta</b> · 让变化有迹可循</span><span>GenLayer 驱动的研究原型 <span className="footer-dot">·</span> {APP_VERSION.split("/")[1]}</span></footer>
      </main>
    </div>
    {modal === "create" && <Modal title="登记一份新公告" onClose={() => setModal(null)}><form onSubmit={submit}>{message?.type === "error" && <p className="form-error" role="alert">{message.text}</p>}<p className="form-intro">先固定来源和关注事项。登记完成后，再单独发起基线抓取。</p><label className="field">公告名称<input required minLength={3} maxLength={120} value={draft.title} onChange={e => setDraft({...draft,title:e.target.value})} placeholder="例如：构建计划参与规则"/></label><label className="field">公开来源 URL<input required type="url" value={draft.sourceUrl} onChange={e => setDraft({...draft,sourceUrl:e.target.value})} placeholder="https://genlayer.foundation/…"/><span>支持 GenLayer 官方相关域名、github.com 和 raw.githubusercontent.com；HTTPS，无端口、账号和锚点。</span></label><fieldset className="criteria-fields"><legend>你想核对哪些条款？<small>{draft.questions.length} / 4</small></legend>{draft.questions.map((q,i) => <div className="criterion-input" key={i}><span>{String(i+1).padStart(2,"0")}</span><textarea aria-label={`关注事项 ${i+1}`} required minLength={8} maxLength={300} rows={2} value={q} onChange={e => setDraft({...draft,questions:draft.questions.map((v,j) => j === i ? e.target.value : v)})} placeholder={i === 0 ? "例如：本期作品提交截止时间是否发生变化？" : "说明需要比较的具体规则或条件"}/>{draft.questions.length > 1 && <button type="button" className="icon-button" aria-label={`删除关注事项 ${i+1}`} onClick={() => setDraft({...draft,questions:draft.questions.filter((_,j) => j !== i)})}><Icon name="close" size={16}/></button>}</div>)}{draft.questions.length < 4 && <button className="text-button" type="button" onClick={() => setDraft({...draft,questions:[...draft.questions,""]})}><Icon name="plus" size={16}/>添加关注事项</button>}</fieldset><div className="privacy-note"><Icon name="shield" size={18}/><p>公告名称、来源、关注事项及抓取正文将公开存储。仅使用公开材料，不填写个人或账户信息。</p></div>{!writeEnabled && <p className="form-error">需要配置并核对部署、加载最终确认状态并连接钱包后，才能登记。{blocking && "已有交易待核对。"}</p>}<div className="modal-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>取消</button><button className="button primary" disabled={!writeEnabled || sending} type="submit">{sending ? "等待钱包…" : "登记公告"}<Icon name="arrow" size={17}/></button></div></form></Modal>}
    {modal === "deploy" && <Modal title="部署与连接" onClose={() => setModal(null)}><div className="deploy-status">{message?.type === "error" && <p className="form-error" role="alert">{message.text}</p>}<span className={`badge ${configured() ? "unknown" : "baseline_required"}`}><span className="status-dot"/>{configured() ? "已配置地址 · 仍需核对" : "当前版本尚未部署"}</span><p>离线示例可直接浏览。真实工作区仅在源码、链 ID 和最终部署状态核对通过后开放写入。</p></div><dl className="config-list"><div><dt>网络</dt><dd>GenLayer Studio · {NETWORK.id}</dd></div><div><dt>公开节点</dt><dd>{NETWORK.rpc}</dd></div><div><dt>合约</dt><dd className="mono">{DEPLOYMENT.address || "尚未配置"}</dd></div><div><dt>部署交易</dt><dd className="mono">{DEPLOYMENT.transaction || "尚未配置"}</dd></div></dl><ol className="deployment-steps"><li>下载当前合约源码，在 GenLayer Studio 导入。构造参数为空。</li><li>由你在钱包中审阅并确认部署。等待最终确认与执行成功，保存合约地址及交易编号。</li><li>将公开地址和部署交易配置到发布版本，再通过链上工作区加载和校验。</li></ol><p className="muted">本页不会自动安装 Snap、请求签名或发送部署。Studio 环境及节点可用性需另行验证。</p><div className="deployment-buttons"><button className="button secondary" onClick={() => download(contractSource, "NoticeDelta.py", "text/x-python")} disabled={!contractSource}><Icon name="download" size={17}/>下载合约源码</button><a className="button primary" href="https://studio.genlayer.com/contracts" target="_blank" rel="noreferrer">在 Studio 部署<Icon name="external" size={15}/></a></div><div className="network-actions"><button className="text-button" onClick={async () => { try { const { switchNetwork } = await import("./chain"); await switchNetwork(); setWallet(""); setWritable(false); setMessage({type:"info",text:"已请求切换 Studio 网络，请重新连接并加载合约。"}); setModal(null); } catch (error) { fail(error); } }}>切换网络至 Studio</button><button className="text-button" onClick={() => {chooseMode("chain"); setModal(null);}}>打开链上工作区<Icon name="arrow" size={16}/></button></div></Modal>}
    {selected && <Modal wide title={selected.title} onClose={() => setSelected(null)}><div className="detail-meta"><Badge verdict={currentRevision?.verdict || "BASELINE_REQUIRED"}/>{!live && <span className="example-tag">虚构离线示例 · 未上链</span>}<a href={selected.sourceUrl} target="_blank" rel="noreferrer">查看来源<Icon name="external" size={14}/></a></div><p className="source-url mono">{selected.sourceUrl}</p><div className="detail-layout"><aside className="version-list"><h3>版本记录</h3>{selected.revisions.length ? selected.revisions.map((rev,i) => <button key={i} className={currentRevision === rev ? "active" : ""} onClick={() => setRevisionIndex(i)}><span>{rev.verdict === "BASELINE" ? "原始基线" : `核验 #${rev.revision}`}</span><small>{date(rev.observedAt)}</small><Badge verdict={rev.verdict}/></button>) : <p>登记已完成，尚无基线。</p>}<p>所有核验均与原始基线比较，基线不会自动替换。</p></aside><div className="evidence-main"><div className="section-title"><h3>{currentRevision?.verdict === "BASELINE" ? "原始来源基线" : "逐条变化与证据"}</h3><button className="text-button" onClick={() => download(safeJson(exportBundle([selected], live ? "chain" : "offline-example",{chainId:live?NETWORK.id:null,contract:live?DEPLOYMENT.address:null})),`notice-delta-notice-${selected.id}.json`)}><Icon name="download" size={15}/>导出</button></div>{currentRevision?.findings.map((f,i) => <article className={`finding ${f.verdict.toLowerCase()}`} key={i}><header><span className="finding-number">{String(i+1).padStart(2,"0")}</span><h4>{f.question}</h4><Badge verdict={f.verdict}/></header><div className="quote-columns"><div><label>原始基线 · 逐字引文</label><blockquote>{f.before || "未提供对应引文"}</blockquote></div><div><label>当前版本 · 逐字引文</label><blockquote>{f.after || "未提供对应引文"}</blockquote></div></div><p className="finding-reason">{f.reason}</p></article>)}{!currentRevision && <div className="empty-state compact"><Icon name="file" size={30}/><h3>下一步：建立原始基线</h3><p>登记只保存来源与关注事项。基线抓取成功后，才能对后续版本发起核验。</p></div>}{currentRevision?.reason && <p className="revision-reason">{currentRevision.reason}</p>}{currentRevision && <details className="snapshot" open={currentRevision.verdict === "BASELINE"}><summary>查看完整正文快照</summary><pre>{currentRevision.evidence || "本次未取得可用的正文快照。"}</pre></details>}{currentRevision && <div className="hash-note"><Icon name="shield" size={17}/><div><span>规范化正文 SHA-256</span><code>{currentRevision.contentHash || "未取得正文，无内容哈希"}</code><p>用于核对规范化渲染正文，不证明该网站的官方身份。{!live && "本示例哈希为展示占位值。"}</p></div></div>}</div></div>{live && <div className="detail-write"><div><strong>{!selected.baselineReady ? "建立基线" : "核验当前版本"}</strong><p>{selected.owner.toLowerCase() !== wallet.toLowerCase() ? "只有登记该公告的钱包可以写入；其他人可以浏览。" : !selected.baselineReady ? "由 GenLayer 获取当前公开正文并冻结，不会覆盖已有基线。" : "重新获取同一来源，与原始基线逐条比较；最多 20 次。"}</p></div><button className="button primary" disabled={!writeEnabled || selected.owner.toLowerCase() !== wallet.toLowerCase() || selected.revisions.filter(r=>r.verdict!=="BASELINE").length>=20} onClick={() => write(selected.baselineReady ? "compare_notice" : "capture_baseline",selected.id)}><Icon name="refresh" size={17}/>{selected.baselineReady ? "核验当前版本" : "建立基线"}</button></div>}</Modal>}
  </div>;
}
