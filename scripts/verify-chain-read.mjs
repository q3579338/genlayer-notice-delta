import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const {chromium}=require(process.env.NOTICEDELTA_PLAYWRIGHT_PATH || 'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-background-networking']});
const out=new URL('../artifacts/ui/',import.meta.url);
await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const report={checkedAt:new Date().toISOString(),mode:'read-only-headless-muted',errors,signatures:0,transactionsSent:0};
try{
  await page.addInitScript(()=>{window.__walletCalls=[];window.ethereum={on(){},removeListener(){},async request(args){window.__walletCalls.push(args.method);throw new Error('Wallet access is disallowed during this read-only check')}}});
  await page.goto(process.env.NOTICEDELTA_PREVIEW_URL||'http://127.0.0.1:5199',{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'链上工作区',exact:true}).click();
  await page.getByRole('button',{name:'加载链上公告',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="status"]')].some(e=>e.textContent?.includes('已读取')||e.classList.contains('error')),{timeout:60000});
  report.message=await page.getByRole('status').innerText();
  report.loaded=report.message.includes('已读取');
  report.walletCalls=await page.evaluate(()=>window.__walletCalls);
  report.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  report.noticeCards=await page.locator('.notice-card').count();
  await page.screenshot({path:new URL('chain-workspace-1440.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
  if(report.noticeCards){await page.getByRole('button',{name:'查看证据',exact:true}).first().click();await page.screenshot({path:new URL('chain-evidence-1440.png',out).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});}
  await writeFile(new URL('chain-read-summary.json',out),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
  if(!report.loaded||errors.length||report.walletCalls.length||report.overflow)process.exitCode=1;
}finally{await browser.close()}
