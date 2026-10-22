import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.NOTICEDELTA_PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--disable-background-networking']});
const out=new URL('../artifacts/ui/',import.meta.url);await mkdir(out,{recursive:true});
const checks=[];
const base=process.env.NOTICEDELTA_PREVIEW_URL||'http://127.0.0.1:5198';
const safe={top:44,right:24,bottom:34,left:24};
function assert(value,message){if(!value)throw new Error(message)}
try{
  for(const dpr of [2,3]){
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:dpr,isMobile:true,reducedMotion:'reduce'});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'networkidle'});
    await page.addStyleTag({content:`:root{--safe-top:${safe.top}px;--safe-right:${safe.right}px;--safe-bottom:${safe.bottom}px;--safe-left:${safe.left}px}`});
    for(const viewport of [{width:390,height:844},{width:844,height:390}]){
      await page.setViewportSize(viewport);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow,`overflow ${dpr} ${viewport.width}`);
      const wallet=await page.getByRole('button',{name:'连接钱包',exact:true}).boundingBox();
      assert(wallet.x>=safe.left&&wallet.x+wallet.width<=viewport.width-safe.right&&wallet.y>=safe.top,`wallet inside safe area ${dpr} ${viewport.width}`);
      await page.getByRole('button',{name:'查看证据',exact:true}).click();
      const close=await page.getByRole('button',{name:'关闭对话框',exact:true}).boundingBox();
      assert(close.y>=safe.top&&close.x+close.width<=viewport.width-safe.right,`dialog close inside safe area ${dpr} ${viewport.width}`);
      const dialogOverflow=await page.getByRole('dialog').evaluate(e=>e.scrollWidth>e.clientWidth);assert(!dialogOverflow,'dialog horizontal overflow');
      await page.screenshot({path:new URL(`safe-evidence-dpr${dpr}-${viewport.width}.png`,out).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
      await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
      await page.getByRole('button',{name:'部署与连接',exact:true}).click();
      const deploy=page.getByRole('link',{name:'在 Studio 部署',exact:true});await deploy.scrollIntoViewIfNeeded();const button=await deploy.boundingBox();
      assert(button.y>=safe.top&&button.y+button.height<=viewport.height-safe.bottom&&button.x>=safe.left&&button.x+button.width<=viewport.width-safe.right,`deployment button inside safe area ${dpr} ${viewport.width}`);
      await page.getByRole('button',{name:'关闭对话框',exact:true}).click();
      if(viewport.width<700){const nav=await page.getByRole('button',{name:'使用说明',exact:true}).boundingBox();assert(nav.y+nav.height<=viewport.height-safe.bottom,'bottom navigation safe area');}
      checks.push({dpr,viewport,simulatedSafeInsets:safe,bodyOverflow:false,dialogOverflow:false,walletInsideSafeArea:true,modalCloseInsideSafeArea:true,deploymentButtonInsideSafeArea:true,runtimeErrors:errors});
    }
    assert(!errors.length,'runtime error');await context.close();
  }
  await writeFile(new URL('safe-area-summary.json',out),JSON.stringify({checkedAt:new Date().toISOString(),mode:'headless-muted',note:'Simulated CSS inset values and DPR/orientation; not real-device notch measurements.',checks},null,2));console.log(JSON.stringify({passed:checks.length}));
}finally{await browser.close()}
