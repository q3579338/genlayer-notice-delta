import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.NOTICEDELTA_PLAYWRIGHT_PATH || "playwright");
const base = process.env.NOTICEDELTA_PREVIEW_URL || "http://127.0.0.1:5198";
const out = new URL("../artifacts/ui/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.NOTICEDELTA_BROWSER_CHANNEL || "chrome", headless: true, args: ["--mute-audio", "--disable-background-networking"] });
const checks = [];
try {
  for (const [width,height] of [[1440,1000],[768,1024],[390,844],[320,740]]) {
    const page = await browser.newPage({ viewport: { width,height }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "每一次变化，都有据可查。" }).waitFor();
    const initialStorage = await page.evaluate(() => JSON.stringify(localStorage));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Horizontal overflow at ${width}`);
    await page.screenshot({path:new URL(`home-${width}.png`,out).pathname.replace(/^\/([A-Za-z]:)/,'$1'), fullPage:true});
    await page.getByRole("button", { name: "查看证据" }).click();
    await page.getByRole("heading", { name: "逐条变化与证据" }).waitFor();
    const dialogOverflow = await page.getByRole("dialog").evaluate(e => e.scrollWidth > e.clientWidth);
    if (dialogOverflow) throw new Error(`Dialog overflow at ${width}`);
    await page.screenshot({path:new URL(`evidence-${width}.png`,out).pathname.replace(/^\/([A-Za-z]:)/,'$1'), fullPage:true});
    await page.getByRole("button",{name:"关闭对话框"}).click();
    await page.getByRole("button",{name:"链上工作区",exact:true}).click();
    await page.getByText("尚未部署", {exact:true}).waitFor();
    if (await page.getByText("开放构建计划 · 参与规则",{exact:true}).count()) throw new Error('Offline fixture leaked into chain workspace');
    const storageAfter = await page.evaluate(() => JSON.stringify(localStorage));
    if (initialStorage !== storageAfter) throw new Error('Browsing examples changed formal storage');
    await page.getByRole("button",{name:"交易与恢复",exact:true}).click();
    await page.getByRole("heading",{name:"还没有发送过交易"}).waitFor();
    await page.getByRole("button",{name:"使用说明",exact:true}).click();
    await page.getByRole("heading",{name:"固定基线，跟踪真正关心的条款。"}).waitFor();
    if (errors.length) throw new Error(errors.join('; '));
    checks.push({ viewport:{width,height}, horizontalOverflow:false, dialogOverflow:false,
      runtimeErrors:errors, exampleStorageUnchanged:true, exampleExcludedFromChain:true });
    await page.close();
  }
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(() => {
    window.__walletCalls = [];
    window.ethereum = { on(){}, removeListener(){}, async request(args) {
      window.__walletCalls.push(args.method);
      if (args.method === 'eth_requestAccounts') return ['0x1111111111111111111111111111111111111111'];
      if (args.method === 'eth_accounts') return ['0x1111111111111111111111111111111111111111'];
      if (args.method === 'eth_chainId') return '0xf22f';
      throw new Error(`Unexpected wallet request: ${args.method}`);
    }};
  });
  await page.goto(base,{waitUntil:'networkidle'});
  if ((await page.evaluate(()=>window.__walletCalls)).length) throw new Error('Wallet called before button');
  await page.getByRole('button',{name:'连接钱包',exact:true}).click();
  await page.getByRole('button',{name:'0x11…1111',exact:true}).waitFor();
  const calls = await page.evaluate(()=>window.__walletCalls);
  if (calls.some(m=>!['eth_requestAccounts','eth_accounts','eth_chainId'].includes(m))) throw new Error(`Unexpected wallet method: ${calls}`);
  checks.push({walletMock:true,noWalletCallsOnLoad:true,connectionMethods:calls,noSigning:true,noSnapInstall:true});
  await page.close();
  await writeFile(new URL('summary.json',out),JSON.stringify({checkedAt:new Date().toISOString(),mode:'headless-muted',checks},null,2));
  console.log(JSON.stringify({passed:checks.length,artifactDirectory:out.pathname}));
} finally { await browser.close(); }
